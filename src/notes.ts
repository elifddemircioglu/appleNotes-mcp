import { execFile } from "node:child_process";

// Runs a JXA script with osascript. Inputs travel as JSON in argv, never
// spliced into the script text, so user content can't inject code.
function runJxa<T>(script: string, args: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", script, JSON.stringify(args)],
      { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) {
          // osascript wraps thrown errors as "execution error: Error: Error: msg (-2700)"
          const msg = (stderr.trim() || err.message)
            .replace(/^.*?execution error: (Error: )*/s, "")
            .replace(/ \(-?\d+\)$/, "");
          return reject(new Error(msg));
        }
        try {
          resolve(JSON.parse(stdout) as T);
        } catch {
          reject(new Error(`Unexpected osascript output: ${stdout}`));
        }
      },
    );
  });
}

export interface NoteSummary {
  id: string;
  title: string;
  folder: string;
  modified: string;
}

export interface Note extends NoteSummary {
  created: string;
  text: string;
}

const ADD_NOTE = `
function run(argv) {
  const a = JSON.parse(argv[0]);
  const Notes = Application("Notes");
  let folder;
  if (a.folder) {
    const matches = Notes.folders.whose({ name: a.folder })();
    if (matches.length === 0) throw new Error("Folder not found: " + a.folder);
    folder = matches[0];
  } else {
    folder = Notes.defaultAccount().defaultFolder();
  }
  const note = Notes.Note({ body: a.html });
  folder.notes.push(note);
  return JSON.stringify({
    id: note.id(),
    title: note.name(),
    folder: folder.name(),
    modified: note.modificationDate().toISOString(),
  });
}`;

const READ_NOTE = `
function run(argv) {
  const a = JSON.parse(argv[0]);
  const Notes = Application("Notes");
  const usable = (n) => !n.passwordProtected() && n.container().name() !== "Recently Deleted";
  // Notes' "name equals" query can miss freshly created notes, so match with
  // "contains" and compare exactly here (trimmed, case-insensitive).
  const wanted = a.title.trim().toLowerCase();
  const candidates = Notes.notes.whose({ name: { _contains: a.title.trim() } })().filter(usable);
  const exact = candidates.filter((n) => n.name().trim().toLowerCase() === wanted);
  if (exact.length > 0) {
    return JSON.stringify({
      found: exact.map((n) => ({
        id: n.id(),
        title: n.name(),
        folder: n.container().name(),
        created: n.creationDate().toISOString(),
        modified: n.modificationDate().toISOString(),
        // plaintext starts with the title line; drop it to avoid repeating it
        text: n.plaintext().split("\\n").slice(1).join("\\n").trim(),
      })),
      similar: [],
    });
  }
  const similar = candidates
    .slice(0, 10)
    .map((n) => ({
      id: n.id(),
      title: n.name(),
      folder: n.container().name(),
      modified: n.modificationDate().toISOString(),
    }));
  return JSON.stringify({ found: [], similar });
}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Notes takes the first line of the body as the note's title, so the header
// goes first as an <h1>, then one <div> per line of content.
function toNoteHtml(title: string, content: string): string {
  const lines = content.split(/\r?\n/).map((l) => `<div>${l ? escapeHtml(l) : "<br>"}</div>`);
  return `<div><h1>${escapeHtml(title)}</h1></div>${lines.join("")}`;
}

export function addNote(title: string, content: string, folder?: string): Promise<NoteSummary> {
  return runJxa<NoteSummary>(ADD_NOTE, { html: toNoteHtml(title, content), folder });
}

export function readNote(title: string): Promise<{ found: Note[]; similar: NoteSummary[] }> {
  return runJxa(READ_NOTE, { title });
}
