package main

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

var audioExts = map[string]bool{
	".wav": true, ".mp3": true, ".ogg": true,
	".flac": true, ".aac": true, ".m4a": true,
}

var imageExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
}

type treeEntry struct {
	Type     string       `json:"type"`
	Name     string       `json:"name,omitempty"`
	Path     string       `json:"path"`
	Children []*treeEntry `json:"children,omitempty"`
}

func buildTree(absPath, relPath string) []*treeEntry {
	f, err := os.Open(absPath)
	if err != nil {
		return nil
	}
	defer f.Close()

	infos, err := f.Readdir(-1)
	if err != nil {
		return nil
	}
	sort.Slice(infos, func(i, j int) bool { return infos[i].Name() < infos[j].Name() })

	var entries []*treeEntry
	var cover string

	for _, info := range infos {
		name := info.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		full := filepath.Join(absPath, name)
		rel := relPath + "/" + name
		ext := strings.ToLower(filepath.Ext(name))

		if info.IsDir() {
			children := buildTree(full, rel)
			entries = append(entries, &treeEntry{Type: "dir", Name: name, Path: rel, Children: children})
		} else if audioExts[ext] {
			entries = append(entries, &treeEntry{Type: "audio", Name: name, Path: rel})
		} else if imageExts[ext] && cover == "" {
			cover = rel
		}
	}

	if cover != "" {
		entries = append([]*treeEntry{{Type: "cover", Path: cover}}, entries...)
	}
	return entries
}

func collectCovers(dir string) []string {
	var covers []string
	f, err := os.Open(dir)
	if err != nil {
		return covers
	}
	defer f.Close()
	infos, _ := f.Readdir(-1)
	for _, info := range infos {
		name := info.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		full := filepath.Join(dir, name)
		if info.IsDir() {
			covers = append(covers, collectCovers(full)...)
		} else if imageExts[strings.ToLower(filepath.Ext(name))] {
			covers = append(covers, full)
		}
	}
	return covers
}

var (
	deckMu  sync.Mutex
	deck    []string
	deckIdx int
)

func nextCoverPath() string {
	covers := collectCovers(mediaDir)
	if len(covers) == 0 {
		return ""
	}
	deckMu.Lock()
	defer deckMu.Unlock()
	if deckIdx >= len(deck) || len(deck) != len(covers) {
		deck = make([]string, len(covers))
		copy(deck, covers)
		rand.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
		deckIdx = 0
	}
	path := deck[deckIdx]
	deckIdx++
	return path
}

func handleRandomCover(w http.ResponseWriter, r *http.Request) {
	path := nextCoverPath()
	if path == "" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}

func handleTree(w http.ResponseWriter, r *http.Request) {
	tree := buildTree(mediaDir, "media")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tree) //nolint:errcheck
}

func mediaHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// strip /media/ prefix, serve from mediaDir
		rel := strings.TrimPrefix(r.URL.Path, "/media/")
		http.ServeFile(w, r, filepath.Join(mediaDir, rel))
	}
}
