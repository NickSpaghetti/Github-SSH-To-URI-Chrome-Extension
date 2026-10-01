package declarations

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf16"
)

// TestColumnPointsAtWritten checks, for every declaration Read returns in
// readTests and testdata/contract.tf, that its line read from Column in
// UTF-16 code units starts with Written.
func TestColumnPointsAtWritten(t *testing.T) {
	contract, err := os.ReadFile(filepath.Join("testdata", "contract.tf"))
	if err != nil {
		t.Fatal(err)
	}
	cases := append(readTests, readTest{name: "contract", fileName: "contract.tf", contents: string(contract)})
	for _, tt := range cases {
		got, err := Read([]byte(tt.contents), tt.fileName)
		if err != nil {
			continue
		}
		lines := strings.Split(tt.contents, "\n")
		for _, d := range got {
			assertColumnPointsAtWritten(t, tt.name, lines, d)
		}
	}
}

func TestColumn(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		contents string
		column   int
	}{
		{"spaces", "main.tf", "module \"m\" {\n  source = \"a/b/c\"\n}\n", 12},
		{"tab", "main.tf", "module \"m\" {\n\tsource\t=\t\"a/b/c\"\n}\n", 11},
		{"one line block", "main.tf", "module \"m\" { source = \"a/b/c\" }\n", 23},
		{"two byte characters before it", "main.tf", "module \"é\" { source = \"a/b/c\" }\n", 23},
		{"astral character before it", "main.tf", "module \"m\" { /* 🦀 */ source = \"a/b/c\" }\n", 32},
		{"crlf", "main.tf", "module \"m\" {\r\n  source = \"a/b/c\"\r\n}\r\n", 12},
		{"unquoted", "main.tf", "module \"m\" {\n  source = local.x\n}\n", 11},
		{"json", "main.tf.json", "{\"module\": {\"m\": {\n  \"source\": \"a/b/c\"\n}}}\n", 13},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Read([]byte(tt.contents), tt.fileName)
			if err != nil {
				t.Fatalf("Read: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("got %d declarations, want 1", len(got))
			}
			if got[0].Column != tt.column {
				t.Errorf("Column = %d, want %d", got[0].Column, tt.column)
			}
			assertColumnPointsAtWritten(t, tt.name, strings.Split(tt.contents, "\n"), got[0])
		})
	}
}

func assertColumnPointsAtWritten(t *testing.T, name string, lines []string, d Declaration) {
	t.Helper()
	line := utf16.Encode([]rune(lines[d.Line-1]))
	written := utf16.Encode([]rune(d.Written))
	if d.Column+len(written) > len(line) {
		t.Errorf("%s: %s: column %d runs past line %d", name, d.Name, d.Column, d.Line)
		return
	}
	if at := string(utf16.Decode(line[d.Column : d.Column+len(written)])); at != d.Written {
		t.Errorf("%s: %s: line %d at column %d reads %q, want %q", name, d.Name, d.Line, d.Column, at, d.Written)
	}
}
