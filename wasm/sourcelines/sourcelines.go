// Package sourcelines finds the line each declaration's source is written on.
package sourcelines

import (
	"strings"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclparse"
	"github.com/zclconf/go-cty/cty"
)

const (
	moduleBlock            = "module"
	terraformBlock         = "terraform"
	requiredProvidersBlock = "required_providers"
	sourceAttribute        = "source"
	jsonSuffix             = ".json"
)

var fileSchema = &hcl.BodySchema{
	Blocks: []hcl.BlockHeaderSchema{
		{Type: moduleBlock, LabelNames: []string{"name"}},
		{Type: terraformBlock},
	},
}

var terraformSchema = &hcl.BodySchema{
	Attributes: []hcl.AttributeSchema{{Name: sourceAttribute}},
	Blocks:     []hcl.BlockHeaderSchema{{Type: requiredProvidersBlock}},
}

var moduleSchema = &hcl.BodySchema{
	Attributes: []hcl.AttributeSchema{{Name: sourceAttribute}},
}

// Find returns the 1-based line of each declaration's source, keyed by the
// name the extension shows it under: the module name, "terraform", or
// "required_providers.<name>". A file with errors yields what could be read.
func Find(contents []byte, fileName string) map[string]int {
	parser := hclparse.NewParser()
	var file *hcl.File
	if strings.HasSuffix(strings.ToLower(fileName), jsonSuffix) {
		file, _ = parser.ParseJSON(contents, fileName)
	} else {
		file, _ = parser.ParseHCL(contents, fileName)
	}

	lines := map[string]int{}
	if file == nil || file.Body == nil {
		return lines
	}

	content, _, _ := file.Body.PartialContent(fileSchema)
	for _, block := range content.Blocks {
		switch block.Type {
		case moduleBlock:
			findModule(block, lines)
		case terraformBlock:
			findTerraform(block, lines)
		}
	}
	return lines
}

func findModule(block *hcl.Block, lines map[string]int) {
	name := block.Labels[0]
	if _, seen := lines[name]; seen {
		return
	}
	content, _, _ := block.Body.PartialContent(moduleSchema)
	if source, ok := content.Attributes[sourceAttribute]; ok {
		lines[name] = source.Expr.Range().Start.Line
	}
}

func findTerraform(block *hcl.Block, lines map[string]int) {
	content, _, _ := block.Body.PartialContent(terraformSchema)
	if source, ok := content.Attributes[sourceAttribute]; ok {
		lines[terraformBlock] = source.Expr.Range().Start.Line
	}

	for _, providers := range content.Blocks {
		attributes, _ := providers.Body.JustAttributes()
		for name, provider := range attributes {
			if line, ok := sourceLineIn(provider.Expr); ok {
				lines[requiredProvidersBlock+"."+name] = line
			}
		}
		// The extension reads only the first required_providers block of each terraform block.
		break
	}
}

func sourceLineIn(object hcl.Expression) (int, bool) {
	pairs, diags := hcl.ExprMap(object)
	if diags.HasErrors() {
		return 0, false
	}
	for _, pair := range pairs {
		if keyOf(pair.Key) == sourceAttribute {
			return pair.Value.Range().Start.Line, true
		}
	}
	return 0, false
}

func keyOf(key hcl.Expression) string {
	if keyword := hcl.ExprAsKeyword(key); keyword != "" {
		return keyword
	}
	value, diags := key.Value(nil)
	if diags.HasErrors() || value.IsNull() || !value.IsKnown() || value.Type() != cty.String {
		return ""
	}
	return value.AsString()
}
