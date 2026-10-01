// Package declarations reads the module sources declared in a Terraform or
// OpenTofu configuration file.
package declarations

import (
	"cmp"
	"maps"
	"slices"
	"strings"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclparse"
	"github.com/zclconf/go-cty/cty"
)

// A BlockType is the type of block a declaration is read from.
type BlockType string

// Block types.
const (
	BlockModule            BlockType = "module"
	BlockTerraform         BlockType = "terraform"
	BlockRequiredProviders BlockType = "required_providers"
)

const (
	sourceAttribute  = "source"
	versionAttribute = "version"
	jsonSuffix       = ".json"
)

// A Declaration is a module source declared in a file.
type Declaration struct {
	// Name is the module name, "terraform", or "required_providers.<name>".
	Name string `json:"name"`
	// Block is the type of block the declaration is read from.
	Block BlockType `json:"block"`
	// Source is the source address. A module's source is evaluated.
	Source string `json:"source"`
	// Written is the source as written, without enclosing quotes.
	Written string `json:"written"`
	// Resolved reports whether Source was evaluated. If false, Source is Written.
	Resolved bool `json:"resolved"`
	// Version is the version constraint, or "" if it does not evaluate to a string.
	Version string `json:"version"`
	// Line is the 1-based line of the source.
	Line int `json:"line"`
}

var fileSchema = &hcl.BodySchema{
	Blocks: []hcl.BlockHeaderSchema{
		{Type: string(BlockModule), LabelNames: []string{"name"}},
		{Type: string(BlockTerraform)},
		{Type: variableBlock, LabelNames: []string{"name"}},
		{Type: localsBlock},
	},
}

var terraformSchema = &hcl.BodySchema{
	Attributes: []hcl.AttributeSchema{{Name: sourceAttribute}},
	Blocks:     []hcl.BlockHeaderSchema{{Type: string(BlockRequiredProviders)}},
}

var moduleSchema = &hcl.BodySchema{
	Attributes: []hcl.AttributeSchema{{Name: sourceAttribute}, {Name: versionAttribute}},
}

// Read returns the declarations in a file, in file order. A fileName ending in
// ".json" is parsed as JSON syntax and any other as native HCL syntax.
//
// A module's source and version are evaluated against the variable defaults
// and locals defined in the file. A module whose source does not evaluate to a
// string is returned with Resolved false. A provider's source and version must
// be literal strings; a provider whose source is not is omitted.
//
// If two modules share a name, the first is returned. If two providers share a
// name, the last is returned, in the position of the first. Diagnostics from
// blocks that Read does not inspect are ignored.
func Read(contents []byte, fileName string) ([]Declaration, error) {
	parser := hclparse.NewParser()
	var file *hcl.File
	var diags hcl.Diagnostics
	if strings.HasSuffix(strings.ToLower(fileName), jsonSuffix) {
		file, diags = parser.ParseJSON(contents, fileName)
	} else {
		file, diags = parser.ParseHCL(contents, fileName)
	}
	if diags.HasErrors() {
		return nil, diags
	}

	content, _, _ := file.Body.PartialContent(fileSchema)
	r := &reader{contents: contents, scope: staticScope(content.Blocks), index: map[string]int{}}
	for _, block := range content.Blocks {
		switch BlockType(block.Type) {
		case BlockModule:
			r.module(block)
		case BlockTerraform:
			r.terraform(block)
		}
	}
	return r.declarations, nil
}

type reader struct {
	contents     []byte
	scope        *hcl.EvalContext
	declarations []Declaration
	index        map[string]int
}

// keepFirst adds d unless a declaration with the same name exists.
func (r *reader) keepFirst(d Declaration) {
	if _, seen := r.index[d.Name]; !seen {
		r.index[d.Name] = len(r.declarations)
		r.declarations = append(r.declarations, d)
	}
}

// keepLast adds d, replacing in place any declaration with the same name.
func (r *reader) keepLast(d Declaration) {
	if at, seen := r.index[d.Name]; seen {
		r.declarations[at] = d
		return
	}
	r.keepFirst(d)
}

func (r *reader) module(block *hcl.Block) {
	content, _, _ := block.Body.PartialContent(moduleSchema)
	source, ok := content.Attributes[sourceAttribute]
	if !ok {
		return
	}
	written := r.written(source.Expr)
	text, resolved := stringIn(source.Expr, r.scope)
	if !resolved {
		text = written
	}
	version := ""
	if attribute, ok := content.Attributes[versionAttribute]; ok {
		version, _ = stringIn(attribute.Expr, r.scope)
	}
	r.keepFirst(Declaration{
		Name:     block.Labels[0],
		Block:    BlockModule,
		Source:   text,
		Written:  written,
		Resolved: resolved,
		Version:  version,
		Line:     source.Expr.Range().Start.Line,
	})
}

// written returns expr as written, without enclosing quotes.
func (r *reader) written(expr hcl.Expression) string {
	text := string(expr.Range().SliceBytes(r.contents))
	if len(text) >= 2 && strings.HasPrefix(text, `"`) && strings.HasSuffix(text, `"`) {
		return text[1 : len(text)-1]
	}
	return text
}

func (r *reader) terraform(block *hcl.Block) {
	content, _, _ := block.Body.PartialContent(terraformSchema)
	if source, ok := content.Attributes[sourceAttribute]; ok {
		if text, ok := literalString(source.Expr); ok {
			r.keepLast(Declaration{
				Name:     string(BlockTerraform),
				Block:    BlockTerraform,
				Source:   text,
				Written:  text,
				Resolved: true,
				Line:     source.Expr.Range().Start.Line,
			})
		}
	}

	if len(content.Blocks) == 0 {
		return
	}
	providers, _ := content.Blocks[0].Body.JustAttributes()
	for _, provider := range byPosition(providers) {
		r.requiredProvider(provider)
	}
}

func (r *reader) requiredProvider(provider *hcl.Attribute) {
	pairs, diags := hcl.ExprMap(provider.Expr)
	if diags.HasErrors() {
		return
	}
	var source, version hcl.Expression
	for _, pair := range pairs {
		switch keyOf(pair.Key) {
		case sourceAttribute:
			source = pair.Value
		case versionAttribute:
			version = pair.Value
		}
	}
	if source == nil {
		return
	}
	text, ok := literalString(source)
	if !ok {
		return
	}
	versionText := ""
	if version != nil {
		versionText, _ = literalString(version)
	}
	r.keepLast(Declaration{
		Name:     string(BlockRequiredProviders) + "." + provider.Name,
		Block:    BlockRequiredProviders,
		Source:   text,
		Written:  text,
		Resolved: true,
		Version:  versionText,
		Line:     source.Range().Start.Line,
	})
}

// literalOnly is an evaluation context with no variables or functions. A nil
// context would read a JSON template as plain text.
var literalOnly = &hcl.EvalContext{}

func literalString(expr hcl.Expression) (string, bool) {
	return stringIn(expr, literalOnly)
}

// stringIn returns the value of expr in context if it is a known string.
func stringIn(expr hcl.Expression, context *hcl.EvalContext) (string, bool) {
	value, diags := expr.Value(context)
	if diags.HasErrors() || value.IsNull() || !value.IsKnown() || value.Type() != cty.String {
		return "", false
	}
	return value.AsString(), true
}

func keyOf(key hcl.Expression) string {
	if keyword := hcl.ExprAsKeyword(key); keyword != "" {
		return keyword
	}
	text, _ := literalString(key)
	return text
}

// byPosition returns attributes sorted by their position in the file.
func byPosition(attributes hcl.Attributes) []*hcl.Attribute {
	ordered := slices.Collect(maps.Values(attributes))
	slices.SortFunc(ordered, func(a, b *hcl.Attribute) int {
		return cmp.Compare(a.Range.Start.Byte, b.Range.Start.Byte)
	})
	return ordered
}
