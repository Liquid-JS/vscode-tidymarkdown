import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

export default {
    input: 'out/extension.js',
    output: {
        dir: 'dist',
        format: 'cjs'
    },
    plugins: [
        commonjs(),
        resolve(),
        json()
    ]
};