//go:build js && wasm

package main

import (
	"syscall/js"

	"github.com/tmccombs/hcl2json/convert"
)

func parseToString(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "expected (hclString, filename?)"}
	}
	filename := "main.tf"
	if len(args) > 1 && args[1].Type() == js.TypeString {
		filename = args[1].String()
	}
	out, err := convert.Bytes([]byte(args[0].String()), filename, convert.Options{})
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"json": string(out)}
}

func main() {
	js.Global().Set("tofuParseToString", js.FuncOf(parseToString))
	select {}
}
