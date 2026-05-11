-- Create standalone FTS5 virtual table (stores its own indexed data)
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  body,
  tokenize = "unicode61 remove_diacritics 1"
);

-- Populate with existing notes
INSERT INTO notes_fts(note_id, title, body)
SELECT id, title, body FROM "Note";

-- Trigger: INSERT
CREATE TRIGGER notes_fts_ai AFTER INSERT ON "Note" BEGIN
  INSERT INTO notes_fts(note_id, title, body)
  VALUES (new.id, new.title, new.body);
END;

-- Trigger: UPDATE
CREATE TRIGGER notes_fts_au AFTER UPDATE ON "Note" BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
  INSERT INTO notes_fts(note_id, title, body)
  VALUES (new.id, new.title, new.body);
END;

-- Trigger: DELETE
CREATE TRIGGER notes_fts_ad AFTER DELETE ON "Note" BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
END;
