"""Showcase mailbox for the README screenshots (`make showcase`): realistic mail for the `demo` user.

Separate from the e2e fixtures (user `klaus`), so the screenshots never depend on test data. Dates are relative to
now, so the list shows Today / Yesterday / weekdays.
"""
import os
from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone

import seed

seed.USER = seed.PASS = "demo"
ME = "Alex Morgan <alex@example.com>"
NOW = datetime.now(timezone.utc).replace(second=0, microsecond=0)

ROADMAP_HTML = """\
<html><body style="font-family: sans-serif">
<p>Hi Alex,</p>
<p>Thanks for joining the roadmap review this morning. Here is a short summary so we are all on the same page.</p>
<h3>Decisions</h3>
<ul>
<li><b>Search</b> ships first, in the first half of November.</li>
<li>The <b>mobile refresh</b> moves to Q1, after the design review.</li>
<li>We keep the current pricing until the new plans are tested with five customers.</li>
</ul>
<h3>Next steps</h3>
<ol>
<li>Marco shares the updated timeline by Friday.</li>
<li>Elena books the onboarding usability sessions.</li>
<li>You and I review the support backlog numbers next Tuesday.</li>
</ol>
<p>The full notes are in the <a href="https://example.com/notes/q4-roadmap">shared doc</a>. Shout if I missed anything.</p>
<p>Best,<br>Priya</p>
<blockquote>On Monday, Alex Morgan wrote:<br>Can we keep the review to 45 minutes? I have a call at 11.</blockquote>
</body></html>
"""

# (from, subject, minutes ago, flags, body, attachment filename or None)
INBOX = [
    ("Priya Shah <priya@example.com>", "Q4 roadmap review: notes and next steps", 38, "", ROADMAP_HTML, None),
    ("CI <ci@example.com>", "Build #482 passed on main", 95, "", "All 214 checks passed in 6m 12s.\n", None),
    ("Marco Rossi <marco@example.com>", "Re: Lisbon offsite, flights booked", 160, "",
     "Flights are booked for the 12th. Hotel confirmation to follow.\n\nMarco\n", None),
    ("Hannah Lee <billing@example.net>", "Invoice INV-2026-1043", 60 * 20, "\\Seen \\Flagged",
     "Hi Alex,\n\nPlease find the October invoice attached. Payment is due within 30 days.\n\nThanks,\nHannah\n",
     "INV-2026-1043.pdf"),
    ("Sam Carter <sam@example.org>", "Weekend hike?", 60 * 26, "\\Seen",
     "The weather looks great for Saturday. The ridge trail, 8 am at the car park?\n", None),
    ("Elena Petrova <elena@example.com>", "Design review: new onboarding flow", 60 * 49, "",
     "Mockups for the new onboarding flow are attached. Comments welcome before Thursday.\n", "onboarding-v2.png"),
    ("The Monthly Bytes <hello@bytes.example>", "October issue: quiet interfaces", 60 * 52, "\\Seen",
     "This month: why calm interfaces win, five keyboard shortcuts you will use daily, and more.\n", None),
    ("Tom Becker <tom@example.org>", "Lunch on Thursday?", 60 * 74, "\\Seen",
     "The new noodle place opened next to the office. 12:30?\n", None),
    ("Aisha Khan <aisha@example.com>", "Contract draft v3 for review", 60 * 98, "\\Seen",
     "Here is v3 with the changes from our call. The liability clause is the only open point.\n",
     "contract-draft-v3.docx"),
    ("Accounts <no-reply@example.com>", "New sign-in to your account", 60 * 120, "\\Seen",
     "We noticed a new sign-in from Firefox on Linux. If this was you, there is nothing to do.\n", None),
    ("Julia Novak <julia@example.org>", "Photos from the trip", 60 * 145, "\\Seen",
     "Finally sorted the photos. The shared album link is below.\n", None),
    ("Daniel Kim <daniel@example.com>", "Re: API rate limits", 60 * 170, "\\Seen",
     "We can raise the limit to 600 requests per minute for your key from Monday.\n", None),
    ("Ops <ops@example.com>", "Team standup moves to 10:00", 60 * 190, "\\Seen",
     "Starting next week, the daily standup moves to 10:00.\n", None),
]
FOLDERS = {
    "Archive": [("Priya Shah <priya@example.com>", "Q3 retrospective", 60 * 24 * 30)],
    "Projects": [("Marco Rossi <marco@example.com>", "Website relaunch kickoff", 60 * 24 * 12),
                 ("Elena Petrova <elena@example.com>", "Brand colours, final", 60 * 24 * 10)],
}
TYPES = {".pdf": ("application", "pdf"), ".png": ("image", "png"),
         ".docx": ("application", "vnd.openxmlformats-officedocument.wordprocessingml.document")}


def message(sender, subject, minutes, body, attachment=None, i=0):
    m = EmailMessage()
    m["From"] = sender
    m["To"] = ME
    m["Subject"] = subject
    m["Date"] = format_datetime(NOW - timedelta(minutes=minutes))
    m["Message-ID"] = f"<showcase-{i}@example.com>"
    if body.lstrip().startswith("<html"):
        m.set_content("This message is best viewed as HTML.\n")
        m.add_alternative(body, subtype="html")
    else:
        m.set_content(body)
    if attachment:
        maintype, subtype = TYPES[os.path.splitext(attachment)[1]]
        m.add_attachment(os.urandom(48 * 1024), maintype=maintype, subtype=subtype, filename=attachment)
    return bytes(m)


def main():
    c = seed.connect()
    d = seed.delimiter(c)
    for f in FOLDERS:
        c.create(f'"{f}"')
        c.subscribe(f'"{f}"')
    for f in ["INBOX", *FOLDERS, "Trash", "Sent", "Drafts"]:
        seed.wipe(c, f)
    # Oldest first: a new user has no sort column, so the list shows arrival order, newest last appended on top.
    for i, (sender, subject, minutes, flags, body, att) in reversed(list(enumerate(INBOX))):
        c.append('"INBOX"', f"({flags})" if flags else "", None, message(sender, subject, minutes, body, att, i))
    for f, items in FOLDERS.items():
        for j, (sender, subject, minutes) in enumerate(items):
            c.append(f'"{f.replace("/", d)}"', "", None, message(sender, subject, minutes, "See attached notes.\n", None, 100 + j))
    c.logout()
    print(f"showcase: {len(INBOX)} messages into INBOX for {seed.USER}")


if __name__ == "__main__":
    main()
