'use strict';

import fm from "front-matter";
import yaml from "js-yaml";
import remark from "remark";
import guide from "remark-preset-lint-markdown-style-guide";
import * as vscode from 'vscode';
import { shortcodes } from "./shortcodes";

const rm = remark()
    .use(guide)
    .use(shortcodes, { startBlock: "{{<", endBlock: ">}}", inlineMode: true });

function format(code: string) {
    return new Promise<string>((resolve, reject) => rm.process(code, (err, res) => {
        if (err)
            return reject(err);

        resolve(String(res));
    }));
}

function cleanCurly(val: any) {
    if (Array.isArray(val))
        val = val.map(cleanCurly);
    else if (val && typeof val == "object") {
        Object.keys(val).forEach(k => val[k] = cleanCurly(val[k]));
    } else if (typeof val == "string") {
        val = val.replace(/[’′]/g, "'").replace(/[“”″]/g, '"').replace(/–/g, "--").replace(/—/g, "---");
    }
    return val;
}

function getRangeOfDocument(document: vscode.TextDocument): vscode.Range {
    const start = new vscode.Position(0, 0);
    const end = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
    return new vscode.Range(start, end);
}

async function _runTidyMarkdown(document: vscode.TextDocument, range: vscode.Range, options: vscode.WorkspaceConfiguration): Promise<string> {
    var c = document.getText(range);

    let out = "";
    let content: string;

    // handle yaml front-matter
    try {
        const matter = fm(c);
        if (Object.keys(matter.attributes).length !== 0) {
            out += `---\n${yaml.safeDump(cleanCurly(matter.attributes), { flowLevel: 1 }).trim()}\n---\n\n`;
        }
        content = matter.body;
    } catch (error) {
        // parsing failed, just ignore front-matter
        content = c;
    }

    content = content.replace(/[’′]/g, "&apos;").replace(/[“”″]/g, "&quot;").replace(/–/g, "--").replace(/—/g, "---");

    out += await format(content);
    return out
}

async function runTidyMarkdown(document: vscode.TextDocument, range: vscode.Range, options: vscode.WorkspaceConfiguration): Promise<vscode.TextEdit[]> {
    var formattedText: string = await _runTidyMarkdown(document, range, options);
    return [new vscode.TextEdit(range, formattedText)];
}

export function activate(context: vscode.ExtensionContext) {
    const supportedDocument: vscode.DocumentSelector = 'markdown';

    // Support formatting the whole document.
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(supportedDocument, {
        async provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
            var tidyMarkdownConfig = vscode.workspace.getConfiguration('tidyMarkdown')
            if (tidyMarkdownConfig && !tidyMarkdownConfig['disableFormatter']) {
                const range = getRangeOfDocument(document);
                const formattedText: vscode.TextEdit[] = await runTidyMarkdown(document, range, tidyMarkdownConfig);
                return formattedText;
            }
            return [];
        }
    }));

    // Support formatting a selection.
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(supportedDocument, {
        async provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
            var tidyMarkdownConfig = vscode.workspace.getConfiguration('tidyMarkdown')
            if (tidyMarkdownConfig && !tidyMarkdownConfig['disableFormatter']) {
                const formattedText: vscode.TextEdit[] = await runTidyMarkdown(document, range, tidyMarkdownConfig);
                return formattedText;
            }
            return [];
        }
    }));
}
