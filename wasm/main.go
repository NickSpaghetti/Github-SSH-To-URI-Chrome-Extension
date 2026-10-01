//go:build js && wasm

package main

import (
	"encoding/json"
	"syscall/js"

	"iac-module-linker/wasm/declarations"
)

// parseToString reads args[0] as the file named args[1] and returns
// {declarations: JSON array} or {error: message}.
func parseToString(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "expected (contents, filename?)"}
	}
	filename := "main.tf"
	if len(args) > 1 && args[1].Type() == js.TypeString {
		filename = args[1].String()
	}

	found, err := declarations.Read([]byte(args[0].String()), filename)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	if found == nil {
		found = []declarations.Declaration{}
	}
	out, err := json.Marshal(found)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"declarations": string(out)}
}

func main() {
	js.Global().Set("tofuParseToString", js.FuncOf(parseToString))
	select {}
}
