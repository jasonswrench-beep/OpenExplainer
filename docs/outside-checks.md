# Outside checks (list item 5)

Written 2026-11-16. OpenExplainer's exports (e-book, PDF, help site, Word) were only ever tried by its own tests and by its own machine checks (`docs/screen-reader-machine-checks.md`). Item 5 asks for checks from outside: an EPUB validator, a PDF accessibility checker and a screen reader user.
None of the three could be done by the build session. What was done is to make the first two **one double-click each** and to write the third as a plan for a person.

## E-book: EPUBCheck

**Double-click `Check EPUB.bat`.** It finds the newest `.epub` in Documents\OpenExplainer Manual, Documents, Downloads or Desktop (or you type another), finds a Java new enough (11 or newer; this PC has Java 25 from Eclipse Adoptium as well as the old Java 8, and the script skips the old one),
and runs **EPUBCheck**, the W3C's own checker for e-books (BSD licence; github.com/w3c/epubcheck). If EPUBCheck is not on the PC it says what it would download (the file's name, its address on the W3C's own GitHub page and its size) and **only downloads if you type `yes`**; it shows the file's SHA-256 afterwards.
The report is saved in `tools\outside-checks\out\` and the result is said in words ("EPUBCheck found no errors: 0 fatal, 0 errors, 0 warnings, 0 notes.").
It changes nothing in any project. Make the e-book first with Export, E-book (EPUB).

## PDF: veraPDF, and PAC by eye

**Double-click `Check PDF.bat`.** It runs **veraPDF** (free, veraPDF.org) over a PDF against **PDF/UA-1**, the accessible-PDF standard, and says PASS or FAIL in words with the report saved beside the e-book's. veraPDF's installer is a program with its own windows, so the script does not run it:
it says where to get it (software.verapdf.org) and looks for it afterwards in `C:\Program Files\veraPDF`, or in the folder named by the `VERAPDF` setting. veraPDF is used as a checker only; nothing of it is in OpenExplainer or sent with it.
A second opinion is **PAC** (the PDF Accessibility Checker, free, pdfua.foundation): open the same PDF in it and write what it says in `TESTING-TODO.md`. The two disagree sometimes, and the disagreements are worth reading.

## A screen reader user

`docs/screen-reader-pass.md` is the script for a person who uses NVDA (or another screen reader) every day, and `docs/screen-reader-results.md` is where the results go (it still says "not yet done"). This session added four windows to it that the script does not yet name:
**Import a recording**, **Send a guide to Studio**, the **My own key** box in AI help and the **Send this to...?** window. They are listed in `TESTING-TODO.md`.

## Nothing was run

No checker was downloaded or run here: downloading a program needs Jason's yes, and the session worked unattended. The scripts' parts that need no network (finding Java, reading a checker's summary, trusting only the W3C's own repository for the download) are tested in `tests/outside-checks.test.ts`.
