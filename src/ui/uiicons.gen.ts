// SPDX-License-Identifier: Apache-2.0 AND ISC
// Made by tools/make_ui_icons.py in the OpenStage Author repository, from its design/icons.json (the suite's one list of icons):
// do not edit by hand. Change that list and run the tool there with --explainer pointing at this file.
// The icons of OpenExplainer's own buttons, menus and panes: Lucide 1.56.0, kept as their drawn shapes, drawn as lines in the
// colour of the words around them, and hidden from screen readers (the words beside an icon, or a button's name, say what it is).
//
// ISC License
//
// Copyright (c) 2026 Lucide Icons and Contributors
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
// ---
//
// The following Lucide icons are derived from the Feather project:
//
// airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
//
// The MIT License (MIT) (for the icons listed above)
//
// Copyright (c) 2013-present Cole Bemis
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

type Shape = { readonly tag: string } & Readonly<Record<string, string | number>>;

export const UI_ICONS = {
  "arrow-down": [{"tag":"path","d":"M12 5v14"},{"tag":"path","d":"m19 12-7 7-7-7"}],
  "arrow-up": [{"tag":"path","d":"m5 12 7-7 7 7"},{"tag":"path","d":"M12 19V5"}],
  "book-a": [{"tag":"path","d":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"},{"tag":"path","d":"m8 13 4-7 4 7"},{"tag":"path","d":"M9.1 11h5.7"}],
  "book-open": [{"tag":"path","d":"M12 5v16"},{"tag":"path","d":"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"}],
  "book-open-check": [{"tag":"path","d":"M12 5v16"},{"tag":"path","d":"m16 12 2 2 4-4"},{"tag":"path","d":"M22 6V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2h4.001A2 2 0 0022 17v-1.344"}],
  "book-open-text": [{"tag":"path","d":"M12 5v16"},{"tag":"path","d":"M16 13h2"},{"tag":"path","d":"M16 9h2"},{"tag":"path","d":"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"},{"tag":"path","d":"M6 13h2"},{"tag":"path","d":"M6 9h2"}],
  "camera": [{"tag":"path","d":"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"},{"tag":"circle","cx":12,"cy":13,"r":3}],
  "check": [{"tag":"path","d":"M20 6 9 17l-5-5"}],
  "chevron-down": [{"tag":"path","d":"m6 9 6 6 6-6"}],
  "circle-dot": [{"tag":"circle","cx":12,"cy":12,"r":1},{"tag":"circle","cx":12,"cy":12,"r":10}],
  "clipboard-check": [{"tag":"rect","width":8,"height":4,"x":8,"y":2,"rx":1,"ry":1},{"tag":"path","d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"},{"tag":"path","d":"m9 14 2 2 4-4"}],
  "clock": [{"tag":"circle","cx":12,"cy":12,"r":10},{"tag":"path","d":"M12 6v6l4 2"}],
  "crop": [{"tag":"path","d":"M6 2v14a2 2 0 0 0 2 2h14"},{"tag":"path","d":"M18 22V8a2 2 0 0 0-2-2H2"}],
  "ellipsis": [{"tag":"circle","cx":12,"cy":12,"r":1},{"tag":"circle","cx":19,"cy":12,"r":1},{"tag":"circle","cx":5,"cy":12,"r":1}],
  "file-input": [{"tag":"path","d":"M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"},{"tag":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"tag":"path","d":"M2 15h10"},{"tag":"path","d":"m9 18 3-3-3-3"}],
  "file-output": [{"tag":"path","d":"M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127"},{"tag":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"tag":"path","d":"m5 11-3 3"},{"tag":"path","d":"m5 17-3-3h10"}],
  "file-plus": [{"tag":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"tag":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"tag":"path","d":"M9 15h6"},{"tag":"path","d":"M12 18v-6"}],
  "file-text": [{"tag":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"tag":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"tag":"path","d":"M10 9H8"},{"tag":"path","d":"M16 13H8"},{"tag":"path","d":"M16 17H8"}],
  "folder-open": [{"tag":"path","d":"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"}],
  "folder-plus": [{"tag":"path","d":"M12 10v6"},{"tag":"path","d":"M9 13h6"},{"tag":"path","d":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}],
  "funnel": [{"tag":"path","d":"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"}],
  "globe": [{"tag":"circle","cx":12,"cy":12,"r":10},{"tag":"path","d":"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"},{"tag":"path","d":"M2 12h20"}],
  "heading": [{"tag":"path","d":"M6 12h12"},{"tag":"path","d":"M6 20V4"},{"tag":"path","d":"M18 20V4"}],
  "image": [{"tag":"rect","width":18,"height":18,"x":3,"y":3,"rx":2,"ry":2},{"tag":"circle","cx":9,"cy":9,"r":2},{"tag":"path","d":"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}],
  "image-plus": [{"tag":"path","d":"M16 5h6"},{"tag":"path","d":"M19 2v6"},{"tag":"path","d":"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"},{"tag":"path","d":"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"},{"tag":"circle","cx":9,"cy":9,"r":2}],
  "image-up": [{"tag":"path","d":"M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"},{"tag":"path","d":"m14 19.5 3-3 3 3"},{"tag":"path","d":"M17 22v-5.5"},{"tag":"circle","cx":9,"cy":9,"r":2}],
  "inbox": [{"tag":"polyline","points":"22 12 16 12 14 15 10 15 8 12 2 12"},{"tag":"path","d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}],
  "keyboard": [{"tag":"path","d":"M10 8h.01"},{"tag":"path","d":"M12 12h.01"},{"tag":"path","d":"M14 8h.01"},{"tag":"path","d":"M16 12h.01"},{"tag":"path","d":"M18 8h.01"},{"tag":"path","d":"M6 8h.01"},{"tag":"path","d":"M7 16h10"},{"tag":"path","d":"M8 12h.01"},{"tag":"rect","width":20,"height":16,"x":2,"y":4,"rx":2}],
  "languages": [{"tag":"path","d":"m5 8 6 6"},{"tag":"path","d":"m4 14 6-6 2-3"},{"tag":"path","d":"M2 5h12"},{"tag":"path","d":"M7 2h1"},{"tag":"path","d":"m22 22-5-10-5 10"},{"tag":"path","d":"M14 18h6"}],
  "link": [{"tag":"path","d":"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"},{"tag":"path","d":"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}],
  "list-checks": [{"tag":"path","d":"M13 5h8"},{"tag":"path","d":"M13 12h8"},{"tag":"path","d":"M13 19h8"},{"tag":"path","d":"m3 17 2 2 4-4"},{"tag":"path","d":"m3 7 2 2 4-4"}],
  "list-indent-decrease": [{"tag":"path","d":"M21 5H11"},{"tag":"path","d":"M21 12H11"},{"tag":"path","d":"M21 19H11"},{"tag":"path","d":"m7 8-4 4 4 4"}],
  "list-indent-increase": [{"tag":"path","d":"M21 5H11"},{"tag":"path","d":"M21 12H11"},{"tag":"path","d":"M21 19H11"},{"tag":"path","d":"m3 8 4 4-4 4"}],
  "list-ordered": [{"tag":"path","d":"M11 5h10"},{"tag":"path","d":"M11 12h10"},{"tag":"path","d":"M11 19h10"},{"tag":"path","d":"M4 4h1v5"},{"tag":"path","d":"M4 9h2"},{"tag":"path","d":"M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"}],
  "list-plus": [{"tag":"path","d":"M16 5H3"},{"tag":"path","d":"M11 12H3"},{"tag":"path","d":"M16 19H3"},{"tag":"path","d":"M18 9v6"},{"tag":"path","d":"M21 12h-6"}],
  "message-square-plus": [{"tag":"path","d":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"},{"tag":"path","d":"M12 8v6"},{"tag":"path","d":"M9 11h6"}],
  "message-square-text": [{"tag":"path","d":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"},{"tag":"path","d":"M7 11h10"},{"tag":"path","d":"M7 15h6"},{"tag":"path","d":"M7 7h8"}],
  "messages-square": [{"tag":"path","d":"M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"},{"tag":"path","d":"M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"}],
  "package-open": [{"tag":"path","d":"M12 22v-9"},{"tag":"path","d":"M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z"},{"tag":"path","d":"M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13"},{"tag":"path","d":"M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z"}],
  "palette": [{"tag":"path","d":"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"},{"tag":"circle","cx":13.5,"cy":6.5,"r":0.5,"fill":"currentColor"},{"tag":"circle","cx":17.5,"cy":10.5,"r":0.5,"fill":"currentColor"},{"tag":"circle","cx":6.5,"cy":12.5,"r":0.5,"fill":"currentColor"},{"tag":"circle","cx":8.5,"cy":7.5,"r":0.5,"fill":"currentColor"}],
  "pen-line": [{"tag":"path","d":"M13 21h8"},{"tag":"path","d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],
  "pencil": [{"tag":"path","d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"},{"tag":"path","d":"m15 5 4 4"}],
  "pencil-line": [{"tag":"path","d":"M13 21h8"},{"tag":"path","d":"m15 5 4 4"},{"tag":"path","d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],
  "pilcrow": [{"tag":"path","d":"M13 4v16"},{"tag":"path","d":"M17 4v16"},{"tag":"path","d":"M19 4H9.5a4.5 4.5 0 0 0 0 9H13"}],
  "plug": [{"tag":"path","d":"M12 22v-5"},{"tag":"path","d":"M15 8V2"},{"tag":"path","d":"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"},{"tag":"path","d":"M9 8V2"}],
  "plus": [{"tag":"path","d":"M5 12h14"},{"tag":"path","d":"M12 5v14"}],
  "printer": [{"tag":"path","d":"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"},{"tag":"path","d":"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"},{"tag":"rect","x":6,"y":14,"width":12,"height":8,"rx":1}],
  "recycle": [{"tag":"path","d":"M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"},{"tag":"path","d":"M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"},{"tag":"path","d":"m14 16-3 3 3 3"},{"tag":"path","d":"M8.293 13.596 7.196 9.5 3.1 10.598"},{"tag":"path","d":"m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"},{"tag":"path","d":"m13.378 9.633 4.096 1.098 1.097-4.096"}],
  "replace": [{"tag":"path","d":"M14 4a1 1 0 0 1 1-1"},{"tag":"path","d":"M15 10a1 1 0 0 1-1-1"},{"tag":"path","d":"M21 4a1 1 0 0 0-1-1"},{"tag":"path","d":"M21 9a1 1 0 0 1-1 1"},{"tag":"path","d":"m3 7 3 3 3-3"},{"tag":"path","d":"M6 10V5a2 2 0 0 1 2-2h2"},{"tag":"rect","x":3,"y":14,"width":7,"height":7,"rx":1}],
  "save": [{"tag":"path","d":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"},{"tag":"path","d":"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"},{"tag":"path","d":"M7 3v4a1 1 0 0 0 1 1h7"}],
  "save-all": [{"tag":"path","d":"M10 2v3a1 1 0 0 0 1 1h5"},{"tag":"path","d":"M18 18v-6a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6"},{"tag":"path","d":"M18 22H4a2 2 0 0 1-2-2V6"},{"tag":"path","d":"M8 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 22 6.828V16a2 2 0 0 1-2.01 2z"}],
  "search": [{"tag":"path","d":"m21 21-4.34-4.34"},{"tag":"circle","cx":11,"cy":11,"r":8}],
  "sparkles": [{"tag":"path","d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"},{"tag":"path","d":"M20 2v4"},{"tag":"path","d":"M22 4h-4"},{"tag":"circle","cx":4,"cy":20,"r":2}],
  "square-pen": [{"tag":"path","d":"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"},{"tag":"path","d":"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"}],
  "text-align-start": [{"tag":"path","d":"M21 5H3"},{"tag":"path","d":"M15 12H3"},{"tag":"path","d":"M17 19H3"}],
  "text-quote": [{"tag":"path","d":"M17 5H3"},{"tag":"path","d":"M21 12H8"},{"tag":"path","d":"M21 19H8"},{"tag":"path","d":"M3 12v7"}],
  "trash": [{"tag":"path","d":"M10 11v6"},{"tag":"path","d":"M14 11v6"},{"tag":"path","d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"},{"tag":"path","d":"M3 6h18"},{"tag":"path","d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}],
  "variable": [{"tag":"path","d":"M8 21s-4-3-4-9 4-9 4-9"},{"tag":"path","d":"M16 3s4 3 4 9-4 9-4 9"},{"tag":"line","x1":15,"x2":9,"y1":9,"y2":15},{"tag":"line","x1":9,"x2":15,"y1":9,"y2":15}],
  "wand-sparkles": [{"tag":"path","d":"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"},{"tag":"path","d":"m14 7 3 3"},{"tag":"path","d":"M5 6v4"},{"tag":"path","d":"M19 14v4"},{"tag":"path","d":"M10 2v2"},{"tag":"path","d":"M7 8H3"},{"tag":"path","d":"M21 16h-4"},{"tag":"path","d":"M11 3H9"}],
  "x": [{"tag":"path","d":"M18 6 6 18"},{"tag":"path","d":"m6 6 12 12"}],
  "zoom-in": [{"tag":"circle","cx":11,"cy":11,"r":8},{"tag":"line","x1":21,"x2":16.65,"y1":21,"y2":16.65},{"tag":"line","x1":11,"x2":11,"y1":8,"y2":14},{"tag":"line","x1":8,"x2":14,"y1":11,"y2":11}],
} as const satisfies Record<string, readonly Shape[]>;

export type UiIconName = keyof typeof UI_ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/** An icon, drawn in the colour of the words beside it and hidden from screen readers. */
export function uiIcon(doc: Document, name: UiIconName): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  for (const [k, v] of [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["focusable", "false"], ["aria-hidden", "true"], ["class", "ui-icon"]] as const) svg.setAttribute(k, v);
  for (const shape of UI_ICONS[name] as readonly Shape[]) {
    const part = doc.createElementNS(SVG_NS, shape.tag);
    for (const [key, value] of Object.entries(shape)) if (key !== "tag") part.setAttribute(key, String(value));
    svg.appendChild(part);
  }
  return svg;
}
