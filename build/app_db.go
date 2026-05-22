package main

// app_db.go — app-specific database migrations.
// Add your tables here. initDB() calls appMigrate() after the core users table.

func appMigrate() error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS progress (
		user_id    INTEGER PRIMARY KEY REFERENCES users(id),
		path       TEXT    NOT NULL,
		position   REAL    NOT NULL DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS media_tree (
		id         INTEGER PRIMARY KEY CHECK (id = 1),
		tree_json  TEXT    NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	return err
}
