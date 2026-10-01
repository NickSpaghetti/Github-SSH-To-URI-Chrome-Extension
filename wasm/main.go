//go:build js && wasm

package main

import (
	"strings"
	"syscall/js"

	"github.com/tmccombs/hcl2json/convert"

	"iac-module-linker/wasm/sourcelines"
)

const jsonSuffix = ".json"

// parseToString returns {json, sourceLines} for HCL and {sourceLines} for
// JSON, which hcl2json cannot read and the extension parses itself.
func parseToString(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "expected (hclString, filename?)"}
	}
	filename := "main.tf"
	if len(args) > 1 && args[1].Type() == js.TypeString {
		filename = args[1].String()
	}
	contents := []byte(args[0].String())

	lines := map[string]any{}
	for name, line := range sourcelines.Find(contents, filename) {
		lines[name] = line
	}

	if strings.HasSuffix(strings.ToLower(filename), jsonSuffix) {
		return map[string]any{"sourceLines": lines}
	}

	out, err := convert.Bytes(contents, filename, convert.Options{})
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"json": string(out), "sourceLines": lines}
}

func main() {
	js.Global().Set("tofuParseToString", js.FuncOf(parseToString))
	select {}
}
