// SPDX-License-Identifier: Apache-2.0
// What tools/build-installer.mjs gives its tests (tests/build-installer.test.ts).
export declare const RELEASE: string;
export declare function folderFlags(home?: string, env?: Record<string, string | undefined>, repo?: string): string[];
export declare function namingUserFolder(files: string[], home?: string): string[];
export declare function webviewMode(script: string): string | null;
