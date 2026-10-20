"""Idempotent seeder: wipes and refills the dev mailbox over IMAP (stdlib only)."""
import imaplib, os, sys, time, glob, email
from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone

HOST = os.environ.get("IMAP_HOST", "127.0.0.1")
PORT = int(os.environ.get("IMAP_PORT", "3143"))
DELIM = os.environ.get("IMAP_DELIMITER")  # optional override; default: ask the server
USER = PASS = "klaus"
HERE = os.path.dirname(os.path.abspath(__file__))
FOLDERS = ["Archive", "Projects", "Projects/Old"]  # logical names, "/" = hierarchy
EMPTY = ["Trash"]  # emptied if present (tests delete into it), never created
FILLER = 40


def connect():
    for _ in range(60):
        try:
            c = imaplib.IMAP4(HOST, PORT)
            c.login(USER, PASS)
            return c
        except Exception as e:  # server still booting
            err = e
            time.sleep(1)
    sys.exit(f"cannot reach IMAP at {HOST}:{PORT}: {err}")


def delimiter(c):
    if DELIM:
        return DELIM
    _, data = c.list()
    first = data[0].decode()
    return first.split('"')[1] if '"' in first else "."


def wipe(c, name):
    typ, _ = c.select(f'"{name}"')
    if typ != "OK":
        return
    _, data = c.search(None, "ALL")
    if data[0]:
        c.store(data[0].replace(b" ", b","), "+FLAGS", "\\Deleted")
        c.expunge()


def put(c, folder, raw):
    typ, resp = c.append(f'"{folder}"', "", None, raw)
    if typ != "OK":
        sys.exit(f"append to {folder} failed: {resp}")


def filler(i, label="Filler message"):
    m = EmailMessage()
    m["From"] = f"Sender {i:02d} <sender{i:02d}@example.org>"
    m["To"] = "Klaus <klaus@localhost>"
    m["Subject"] = f"{label} {i:02d}: scrolling material"
    m["Date"] = format_datetime(datetime(2026, 10, 17, tzinfo=timezone.utc) - timedelta(hours=i))
    m["Message-ID"] = f"<filler-{i:02d}@quiet.test>"
    m["X-Quiet-Fixture"] = f"filler-{i:02d}"
    m.set_content(f"Filler body {i}.\n")
    return bytes(m)


def main():
    c = connect()
    d = delimiter(c)
    folders = [f.replace("/", d) for f in FOLDERS]
    for f in folders:
        c.create(f'"{f}"')  # NO if it already exists; fine
        c.subscribe(f'"{f}"')
    for f in ["INBOX"] + folders + EMPTY:
        wipe(c, f)
    n = 0
    for path in sorted(glob.glob(os.path.join(HERE, "messages", "*.eml"))):
        put(c, "INBOX", open(path, "rb").read())
        n += 1
    for i in range(1, FILLER + 1):
        put(c, "INBOX", filler(i))
        n += 1
    for f in folders:
        for i in (1, 2):
            put(c, f, filler(i, f"Folder {f} message"))
    c.logout()
    print(f"seeded {HOST}:{PORT}: {n} messages into INBOX, 2 each into {', '.join(folders)}")


if __name__ == "__main__":
    main()
