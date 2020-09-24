import tidyMarkdown from "@f-fjs/tidy-markdown";
import { parseFragment, serialize } from "parse5";

/*
   remark-shortcodes
   A remark plugin to allow custom block-level Wordpress/Hugo-like
   shortcodes to be parsed as part of the Remark Markdown AST. Note
   that this plugin does not apply any transformations, but simply
   parses the shortcodes and adds the relevant data to the AST. The
   start & end blocks are configurable, but the inner shortcode
   including the name and the key="value" pairs must be as expected.
   To apply transformations from the shortcodes to HTML or other
   formats, please see the example in the README.
   e.g
        // with no attributes
        [[ ShortcodeNameA ]]
        // with multiple attributes
        [[ ShortcodeNameC a="b" c="d" ]]
        // with custom start/end Blocks
        {{% ShortcodeNameD a="1" c="2" %}}
        // An example node format for a shortcode with attributes
        {
          type: 'shortcode',
          identifier: 'ShortcodeNameC',
          attributes: {
              a: '1',
              c: '2'
          }
        }
   With thanks to official remark plugins:
   https://github.com/wooorm/remark-breaks/blob/master/index.js
   https://github.com/wooorm/remark-gemoji/blob/master/index.js
*/

export function shortcodes(options) {
    const startBlock = (options || {}).startBlock || "[[";
    const endBlock = (options || {}).endBlock || "]]";
    const inlineMode = (options || {}).inlineMode || false;

    if (isRemarkParser(this.Parser)) {
        const parser = this.Parser.prototype;
        const tokenizers = inlineMode ? parser.inlineTokenizers : parser.blockTokenizers;
        const methods = inlineMode ? parser.inlineMethods : parser.blockMethods;

        tokenizers.shortcode = shortcodeTokenizer;
        methods.splice(methods.indexOf("html"), 0, "shortcode");
    }
    if (isRemarkCompiler(this.Compiler)) {
        const compiler = this.Compiler.prototype;
        compiler.visitors.shortcode = shortcodeCompiler;
    }

    function locator(value, fromIndex) {
        return value.indexOf(startBlock, fromIndex);
    }

    function shortcodeTokenizer(eat, value, silent) {
        let entireShortcode;
        let innerShortcode;
        let parsedShortcode;
        let endPosition;
        let endBlockPosition;

        if (!value.startsWith(startBlock)) return;

        endBlockPosition = value.indexOf(endBlock, startBlock.length);
        if (endBlockPosition === -1) return;

        endPosition = endBlockPosition + endBlock.length;
        entireShortcode = value.slice(0, endPosition);
        innerShortcode = value.slice(startBlock.length, endBlockPosition);

        parsedShortcode = parseShortcode(innerShortcode);

        // If there is no parsed data, something fishy is up - return nothing.
        if (!parsedShortcode) return;

        /* Exit with true in silent mode after successful parse - never used (yet) */
        /* istanbul ignore if */
        if (silent) {
            return true;
        }

        return eat(entireShortcode)({
            type: "shortcode",
            identifier: parsedShortcode.identifier,
            attributes: parsedShortcode.attributes,
        });
    }
    shortcodeTokenizer.locator = locator;

    function shortcodeCompiler(node) {
        const ser = serialize({
            nodeName: "#document-fragment",
            childNodes: [{
                nodeName: "tag",
                tagName: "tag",
                attrs: Object.entries(node.attributes || {})
                    .map(([name, value]) => ({
                        name,
                        value,
                    })),
            }],
        }).trim();
        const attributes = ser.substr(4, ser.length - 4 - 7).trim();

        const parts = [
            "{{<",
            node.identifier,
            attributes,
            ">}}",
        ];
        return parts.map(v => v.trim()).filter(v => !!v).join(" ");
    }
}

/**
 * Parses the inner shortcode to extract shortcode name & key-value attributes.
 * @param {string} innerShortcode - Extracted shortcode from between the start & end blocks.
 */
function parseShortcode(innerShortcode) {
    const trimmedInnerShortcode = innerShortcode.trim();

    // If no shortcode, it was blank between the blocks - return nothing.
    if (!trimmedInnerShortcode) return;

    // If no whitespace, then shortcode is just name with no attributes.
    if (!hasWhiteSpace(trimmedInnerShortcode)) {
        return { identifier: trimmedInnerShortcode, attributes: {} };
    }

    const splitShortcode = trimmedInnerShortcode.match(/^(\S+)\s(.*)/).slice(1);
    const shortcodeName = splitShortcode[0];
    const attributeString = splitShortcode[1];
    const attributes = parseShortcodeAttributes(attributeString);

    // If no attributes parsed, something went wrong - return nothing.
    if (!attributes) return;

    return {
        identifier: shortcodeName,
        attributes,
    };
}

/**
 * Discovers if a string contains any whitespace.
 * @param {string} s - the string to test for whitespace.
 */
function hasWhiteSpace(s) {
    return /\s/g.test(s);
}

const mdAttrs = new Set(["title", "alt", "caption"]);

/**
 * Parses the key/value attributes from the attribute string.
 * @param {string} attributeString - e.g 'a="b" c=2 e="3"'
 */
function parseShortcodeAttributes(attributeString) {
    const attr = parseFragment(`<tag ${attributeString}/>`)["childNodes"][0].attrs || [];

    const attributes = attr.reduce((t, { name, value }) => {
        t[name] = mdAttrs.add(name.toLowerCase())
            ? tidyMarkdown("" + (value || "")).trim()
            : value;
        return t;
    }, {});
    return attributes;
}

function isRemarkParser(parser) {
    return Boolean(
        parser &&
        parser.prototype &&
        parser.prototype.inlineTokenizers &&
        parser.prototype.inlineTokenizers.break &&
        parser.prototype.inlineTokenizers.break.locator,
    );
}

function isRemarkCompiler(compiler) {
    return Boolean(compiler && compiler.prototype);
}