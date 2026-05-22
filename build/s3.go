package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	yandexEndpoint = "https://storage.yandexcloud.net"
	yandexRegion   = "ru-central1"
)

// ── AWS Signature V4 helpers ───────────────────────────────────────────────

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func hexSHA256(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func signingKey(secret, date string) []byte {
	k := hmacSHA256([]byte("AWS4"+secret), date)
	k = hmacSHA256(k, yandexRegion)
	k = hmacSHA256(k, "s3")
	return hmacSHA256(k, "aws4_request")
}

func signRequest(req *http.Request, key, secret string) {
	now := time.Now().UTC()
	date := now.Format("20060102")
	datetime := now.Format("20060102T150405Z")
	payloadHash := hexSHA256("")

	req.Header.Set("x-amz-date", datetime)
	req.Header.Set("x-amz-content-sha256", payloadHash)

	// canonical headers (sorted)
	headers := map[string]string{
		"host":                 req.URL.Host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date":           datetime,
	}
	var headerKeys []string
	for k := range headers {
		headerKeys = append(headerKeys, k)
	}
	sort.Strings(headerKeys)
	var canonHeaders, signedHeaders strings.Builder
	for i, k := range headerKeys {
		canonHeaders.WriteString(k + ":" + headers[k] + "\n")
		if i > 0 {
			signedHeaders.WriteByte(';')
		}
		signedHeaders.WriteString(k)
	}

	canonReq := strings.Join([]string{
		req.Method,
		req.URL.Path,
		req.URL.RawQuery,
		canonHeaders.String(),
		signedHeaders.String(),
		payloadHash,
	}, "\n")

	credScope := date + "/" + yandexRegion + "/s3/aws4_request"
	strToSign := "AWS4-HMAC-SHA256\n" + datetime + "\n" + credScope + "\n" + hexSHA256(canonReq)
	sig := hex.EncodeToString(hmacSHA256(signingKey(secret, date), strToSign))

	req.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s,SignedHeaders=%s,Signature=%s",
		key, credScope, signedHeaders.String(), sig,
	))
}

// ── S3 list objects ────────────────────────────────────────────────────────

type listBucketResult struct {
	XMLName               xml.Name  `xml:"ListBucketResult"`
	Contents              []s3Item  `xml:"Contents"`
	IsTruncated           bool      `xml:"IsTruncated"`
	NextContinuationToken string    `xml:"NextContinuationToken"`
}

type s3Item struct {
	Key string `xml:"Key"`
}

func listS3Objects(bucket, key, secret string) ([]string, error) {
	var allKeys []string
	var contToken string

	for {
		params := url.Values{"list-type": {"2"}, "max-keys": {"1000"}}
		if contToken != "" {
			params.Set("continuation-token", contToken)
		}

		u := &url.URL{
			Scheme:   "https",
			Host:     "storage.yandexcloud.net",
			Path:     "/" + bucket,
			RawQuery: params.Encode(),
		}
		req, _ := http.NewRequest("GET", u.String(), nil)
		signRequest(req, key, secret)

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("s3 list: %w", err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("s3 list returned %d: %s", resp.StatusCode, body)
		}

		var result listBucketResult
		if err := xml.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("s3 list parse: %w", err)
		}
		for _, item := range result.Contents {
			allKeys = append(allKeys, item.Key)
		}
		if !result.IsTruncated {
			break
		}
		contToken = result.NextContinuationToken
	}
	return allKeys, nil
}

// ── Tree building from S3 keys ─────────────────────────────────────────────

type s3Node struct {
	coverURL  string
	coverPath string
	audio     []*treeEntry
	dirs      map[string]*s3Node
	dirNames  []string
}

func newS3Node() *s3Node {
	return &s3Node{dirs: make(map[string]*s3Node)}
}

func (n *s3Node) insert(fullKey string, parts []string, fileURL string) {
	name := parts[len(parts)-1]
	if len(parts) == 1 {
		ext := strings.ToLower(filepath.Ext(name))
		if audioExts[ext] {
			n.audio = append(n.audio, &treeEntry{Type: "audio", Name: name, Path: fullKey, URL: fileURL})
		} else if imageExts[ext] && n.coverURL == "" {
			n.coverURL = fileURL
			n.coverPath = fullKey
		}
		return
	}
	dir := parts[0]
	if _, ok := n.dirs[dir]; !ok {
		n.dirs[dir] = newS3Node()
		n.dirNames = append(n.dirNames, dir)
	}
	n.dirs[dir].insert(fullKey, parts[1:], fileURL)
}

func (n *s3Node) toEntries() []*treeEntry {
	var result []*treeEntry
	if n.coverURL != "" {
		result = append(result, &treeEntry{Type: "cover", Path: n.coverPath, URL: n.coverURL})
	}
	sort.Strings(n.dirNames)
	for _, name := range n.dirNames {
		result = append(result, &treeEntry{
			Type:     "dir",
			Name:     name,
			Path:     name,
			Children: n.dirs[name].toEntries(),
		})
	}
	sort.Slice(n.audio, func(i, j int) bool { return n.audio[i].Name < n.audio[j].Name })
	return append(result, n.audio...)
}

// ── updateTreeFromS3 ───────────────────────────────────────────────────────

func updateTreeFromS3() error {
	bucket := os.Getenv("S3_BUCKET")
	key := os.Getenv("S3_KEY")
	secret := os.Getenv("S3_SECRET")
	if bucket == "" || key == "" || secret == "" {
		return fmt.Errorf("S3_BUCKET, S3_KEY and S3_SECRET must be set")
	}

	keys, err := listS3Objects(bucket, key, secret)
	if err != nil {
		return err
	}

	root := newS3Node()
	for _, k := range keys {
		if strings.HasSuffix(k, "/") {
			continue
		}
		parts := strings.Split(k, "/")
		fileURL := yandexEndpoint + "/" + bucket + "/" + k
		root.insert(k, parts, fileURL)
	}

	data, err := json.Marshal(root.toEntries())
	if err != nil {
		return fmt.Errorf("marshal tree: %w", err)
	}

	_, err = db.Exec(`
		INSERT INTO media_tree (id, tree_json) VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET tree_json = excluded.tree_json, updated_at = CURRENT_TIMESTAMP
	`, string(data))
	if err != nil {
		return fmt.Errorf("save tree: %w", err)
	}

	log.Printf("--update: indexed %d objects from s3://%s", len(keys), bucket)
	return nil
}
