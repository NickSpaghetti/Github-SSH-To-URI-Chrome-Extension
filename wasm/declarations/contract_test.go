package declarations

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
)

var update = flag.Bool("update", false, "rewrite testdata/contract.json from the current output")

// TestContract checks the JSON of Read's result for testdata/contract.tf
// against testdata/contract.json.
func TestContract(t *testing.T) {
	contents, err := os.ReadFile(filepath.Join("testdata", "contract.tf"))
	if err != nil {
		t.Fatal(err)
	}
	declarations, err := Read(contents, "contract.tf")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	got, err := json.MarshalIndent(declarations, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')

	golden := filepath.Join("testdata", "contract.json")
	if *update {
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("output no longer matches %s. If the change is intended, run go test -update, then update ParsedDeclaration.\ngot:\n%s\nwant:\n%s", golden, got, want)
	}
}

// TestContractCoversEveryBlockType checks that testdata/contract.tf declares
// every block type.
func TestContractCoversEveryBlockType(t *testing.T) {
	contents, err := os.ReadFile(filepath.Join("testdata", "contract.tf"))
	if err != nil {
		t.Fatal(err)
	}
	declarations, err := Read(contents, "contract.tf")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	seen := map[BlockType]bool{}
	for _, d := range declarations {
		seen[d.Block] = true
	}
	for _, block := range []BlockType{BlockModule, BlockTerraform, BlockRequiredProviders} {
		if !seen[block] {
			t.Errorf("testdata/contract.tf declares no %q block", block)
		}
	}
}
