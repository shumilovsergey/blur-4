package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

type progressRecord struct {
	Path     string  `json:"path"`
	Position float64 `json:"position"`
}

func handleSaveProgress(w http.ResponseWriter, r *http.Request) {
	userID := sessionUserID(r)

	var body progressRecord
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	_, err := db.ExecContext(r.Context(), `
		INSERT INTO progress (user_id, path, position, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			path       = excluded.path,
			position   = excluded.position,
			updated_at = excluded.updated_at
	`, userID, body.Path, body.Position)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleGetProgress(w http.ResponseWriter, r *http.Request) {
	userID := sessionUserID(r)

	var rec progressRecord
	err := db.QueryRowContext(r.Context(),
		`SELECT path, position FROM progress WHERE user_id = ?`, userID,
	).Scan(&rec.Path, &rec.Position)

	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rec) //nolint:errcheck
}
