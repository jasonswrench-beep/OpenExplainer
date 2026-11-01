# Screen reader pass: what to do with NVDA

This is a guide for one person to follow, with the free screen reader NVDA, to find out how OpenExplainer and the things it makes sound to a person who cannot see the screen. It takes about two hours and can be done in two sittings. Nothing in it needs you to write code, and nothing in it changes your books: use the copy of the guide that comes with it.

**Why this is a person's job.** The machine checks in `docs/screen-reader-machine-checks.md` find things a program can find: a button with no name, a window you cannot leave by keyboard, a picture with no description, a heading level that jumps. They cannot tell you whether the words are in a sensible order, whether a message is spoken when it matters, whether a long list is tiring to listen to, or whether the pictures' descriptions say what you need. Only listening does that. Until this pass is done, the claim that OpenExplainer works with a screen reader is supported by the machine checks and by the design, **not** by a person listening.

## Before you start

1. Install NVDA (free, from nvaccess.org). Start it. The **NVDA key** is Insert (or Caps Lock, if NVDA is set to use it).
2. Run `Start Screen Reader Pass.bat` in the folder this guide came in. It opens this checklist in your browser and opens OpenExplainer with a copy of the OpenStage Author guide. Everything you change is in the copy.
3. Have a way to note what you hear. The simplest is to keep this checklist open and type under each line. Use the marks below.

| Mark | Meaning |
| --- | --- |
| OK | I could do it and what I heard made sense. |
| PROBLEM | I could not do it, or what I heard was missing, wrong or confusing. Say what you heard. |
| UNSURE | I could do it but something sounded odd. Say what. |

## The keys you will use

| Keys | What they do |
| --- | --- |
| Tab and Shift+Tab | Move to the next or the previous thing you can use. |
| Arrow keys | Move in a list, a tree or a text box. |
| Enter and Space | Press a button or choose an item. |
| Esc | Close a window. |
| F6 and Shift+F6 | In OpenExplainer, move between the three panes. |
| Ctrl | Stop NVDA speaking. |
| NVDA+T | Read the title of the window. |
| NVDA+Tab | Say what has the keyboard now. |
| NVDA+F7 | List the headings, links, buttons and landmarks of a page (in a browser). |
| H and Shift+H | Next and previous heading (in a browser, PDF or Word). |
| D and Shift+D | Next and previous landmark (in a browser). |
| K | Next link (in a browser). |
| NVDA+Space | Switch between browse mode and focus mode, if NVDA does not do it for you. |

## Part A: the program (about 60 minutes)

For each line, do the task, listen, and mark it.

**A1. Starting.**
1. With the program open, press NVDA+T. *You should hear* the program's name and the project's name.
2. Press Tab slowly through the toolbar. *You should hear* each button's name and the word "button". Count them: there are about eighteen. Does any say only "button" with no name?
3. The first Tab from the top of the window should reach a link that says Skip to main content. Press Enter on it. *You should hear* the main area announced.

**A2. The three panes.**
1. Press F6. *You should hear* the name of the next pane: "Page of ..." or "Properties" or "Chapters and topics". Press F6 until you are back where you began. Is it clear where you are each time?
2. Press Shift+F6 to go back.

**A3. The chapters and topics.**
1. Go to the chapters and topics pane (F6). Press the Down arrow. *You should hear* the topic's number and title, its level, whether it is open or closed, and its status in words (such as "Drafted").
2. Press the Right arrow on a chapter to open it and the Left arrow to close it. *You should hear* it open and close.
3. Choose a topic and press the buttons below the tree: add a topic, rename it, move it. Is each button's name clear? Is the result spoken (for example "Added ...")?

**A4. The page of a topic.**
1. Press F6 to the page pane. Move through the blocks. *You should hear* each block's kind (paragraph, heading, numbered procedure, boxed note, picture) before its words.
2. Press the button that adds a paragraph. Type a sentence. Add some bold with the way the program offers. Is the result spoken?
3. Find a numbered procedure. Can you hear which step you are on and the step's number?
4. Find a boxed note. Do you hear its kind (such as Caution) as words, before the text?

**A5. Pictures.**
1. Select topic 2.2 "A tour of the window". Find its picture. *You should hear* its description, or a clear sign that it has none.
2. Press **Edit description**. A window opens. *You should hear* its name and the text box. Change one word. Press Save. Is the change spoken?
3. Open the window for **Callouts** and the one for **Drawing**. Can you understand what each is for from what you hear? (The drawing window is the hardest. If you cannot use it, say so: that is useful to know.)
4. Press **Replace the picture file** and cancel the file chooser with Esc. Is the keyboard back on the button?

**A6. The windows.** For each window below: open it from the toolbar, listen to its name and what it says first, Tab through it, then press Esc. *You should hear* the name when it opens. Tab should never leave the window. Esc should close it and put the keyboard back on the button you used.
- Project variables, Writing style, Reuse, History, Drafts, Guides, Index, AI help, MCP access, Check the book, Export, Look of the book.

Then try these in particular:
1. **Look of the book.** Type an accent colour that is too light, such as FFD600. *You should hear* a warning in words, not only see a colour. Type something that is not a colour. Does the window refuse to close, and is the reason spoken?
2. **Look of the book, language.** Type a wrong language code such as english. Is the warning spoken?
3. **History.** Press **Take a snapshot now**, give it a name, and press OK. *You should hear* that the snapshot was taken. Press **Compare with the book now**. *You should hear* how many differences there are. Is the list readable?
4. **Check the book.** Press **Go to it** on a thing. Does the keyboard land on the control that fixes it, and do you know where you are?
5. **Export.** Move through the kinds with the arrow keys. *You should hear* each kind's name and its description. Choose **Translation file (XLIFF)** and leave the language empty, then press Export. Is the problem spoken, and is the keyboard on the language box?

**A7. Messages.**
1. Press Ctrl+S. *You should hear* that the project was saved, without the keyboard moving.
2. Do something that gives a message (for example add a topic). Is it spoken once, and not twice?

**A8. Anything that traps you.** In every window and pane, can you always get out with the keyboard alone? Write down any place where you could not.

## Part B: the help site (about 20 minutes)

Make the help site with **Export, Help site**, unzip it, and open `index.html` in Edge. (The folder this guide came in already has one, called `help site`.)

**B1.** Press NVDA+T. *You should hear* the topic's title and the book's name.
**B2.** Press Tab once. *You should hear* "Skip to the topic". Press Enter. Press Tab again. Are you at the start of the topic's words, not back in the menu?
**B3.** Press D repeatedly. *You should hear* the landmarks: the contents of the book, the site, search, the breadcrumb, the topic itself, previous and next. Are their names clear?
**B4.** Press H repeatedly. *You should hear* the topic's title first, then its headings in order.
**B5.** Find a numbered procedure. Does it say how many items it has and which one you are on?
**B6.** Find a picture. *You should hear* a description that tells you what you need. Does it say too much, too little, or the same thing twice (the picture's description, then the list of callouts)?
**B7.** Find a boxed note. *You should hear* its kind in words (Caution, Design Tip) before the text.
**B8.** Use the search box: type a word, press Enter. Are the results announced? Can you reach them and close them with the keyboard?
**B9.** Follow a link inside the text. Does the link's name tell you where it goes?

## Part C: the PDF (about 20 minutes)

Make the PDF with **Export, PDF** and open it in a desktop PDF reader (free) with NVDA running.

**C1.** Is the title read when it opens, and not the file name?
**C2.** Press H. *You should hear* headings, in the order of the book. Press it many times: does the order make sense?
**C3.** Open the bookmarks (a desktop PDF program: View, Show/Hide, Navigation Panes, Bookmarks). Do they match the chapters?
**C4.** Find a picture. Is its description read?
**C5.** Find a numbered list. Is it read as a list of numbered items?
**C6.** Find a link in the text. Is its name sensible, and does it go to the right place?
**C7.** Read the first chapter from its start with NVDA+Down arrow ("say all"). Is the order of the words the order a sighted reader reads? Does anything come out twice or in the wrong place (a header, a page number, a picture's list before the picture)?

## Part D: the Word file (about 10 minutes)

Make the Word file with **Export, Word** and open it in Word with NVDA running.

**D1.** Press H. Do the headings follow the book? Do the chapter numbers and titles read well?
**D2.** Find a picture. Is its description read?
**D3.** Find a numbered procedure. Are the steps numbered 1, 2, 3 and does the numbering start again at 1 for the next procedure?
**D4.** Find a boxed note. Is its kind read as a word?

## Part E: the e-book (about 10 minutes, if you have a reading app)

Make the e-book with **Export, E-book (EPUB)** and open it in a reading app that works with NVDA (Thorium Reader is free and made for this).

**E1.** Is the title read? Is the contents list reachable, and does each entry go to its chapter?
**E2.** Press H or use the app's way of moving by heading. Do the headings follow the book?
**E3.** Find a picture. Is its description read?
**E4.** Does the app say that the book has a contents list, an index and descriptions of pictures (it reads this from the book's accessibility information)?

## What to send back

Send the lines you marked PROBLEM or UNSURE, with what you heard, in whatever words you like ("A5.2: I heard Edit description button, then nothing when the window opened"). Each will be looked at, fixed or explained, and the result added to `docs/screen-reader-results.md`. Say too which parts you did not do.

Please do not mark anything OK that you were not sure about. A line marked UNSURE is more useful than a line marked OK that was not true.

## What this guide cannot tell you

It tests NVDA with Edge, a desktop PDF reader, Word and one reading app. Other screen readers (JAWS, Narrator, VoiceOver) and other browsers may differ; a person who uses one of those every day is the best judge. The pass does not test voice control, magnification, or a switch.
