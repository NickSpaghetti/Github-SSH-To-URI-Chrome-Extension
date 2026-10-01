package declarations

import (
	"github.com/hashicorp/hcl/v2"
	"github.com/zclconf/go-cty/cty"
)

const (
	variableBlock    = "variable"
	localsBlock      = "locals"
	defaultAttribute = "default"
	varRoot          = "var"
	localRoot        = "local"
)

var variableSchema = &hcl.BodySchema{
	Attributes: []hcl.AttributeSchema{{Name: defaultAttribute}},
}

// staticScope returns an evaluation context holding the variable defaults
// defined in blocks and the locals that evaluate from them.
func staticScope(blocks hcl.Blocks) *hcl.EvalContext {
	s := &scope{
		variables: map[string]cty.Value{},
		locals:    map[string]cty.Value{},
		written:   map[string]*hcl.Attribute{},
		visited:   map[string]bool{},
	}
	var order []string
	for _, block := range blocks {
		switch block.Type {
		case variableBlock:
			content, _, _ := block.Body.PartialContent(variableSchema)
			if value, ok := known(content.Attributes[defaultAttribute], literalOnly); ok {
				s.variables[block.Labels[0]] = value
			}
		case localsBlock:
			attributes, _ := block.Body.JustAttributes()
			for _, local := range byPosition(attributes) {
				if _, seen := s.written[local.Name]; !seen {
					s.written[local.Name] = local
					order = append(order, local.Name)
				}
			}
		}
	}
	s.variablesObject = cty.ObjectVal(s.variables)
	for _, name := range order {
		s.resolve(name)
	}
	return s.context()
}

type scope struct {
	variables map[string]cty.Value
	locals    map[string]cty.Value
	written   map[string]*hcl.Attribute
	visited   map[string]bool
	// variablesObject is variables as an object value.
	variablesObject cty.Value
}

// resolve evaluates the named local after the locals it references. A local
// in a reference cycle is left unresolved.
func (s *scope) resolve(name string) {
	local, ok := s.written[name]
	if !ok || s.visited[name] {
		return
	}
	s.visited[name] = true
	referred := map[string]cty.Value{}
	for _, traversal := range local.Expr.Variables() {
		if traversal.RootName() != localRoot || len(traversal) < 2 {
			continue
		}
		attribute, ok := traversal[1].(hcl.TraverseAttr)
		if !ok {
			continue
		}
		s.resolve(attribute.Name)
		if value, ok := s.locals[attribute.Name]; ok {
			referred[attribute.Name] = value
		}
	}
	if value, ok := known(local, s.contextWith(referred)); ok {
		s.locals[name] = value
	}
}

// context returns an evaluation context with every variable and resolved local.
func (s *scope) context() *hcl.EvalContext {
	return s.contextWith(s.locals)
}

// contextWith returns an evaluation context with every variable and the given locals.
func (s *scope) contextWith(locals map[string]cty.Value) *hcl.EvalContext {
	return &hcl.EvalContext{Variables: map[string]cty.Value{
		varRoot:   s.variablesObject,
		localRoot: cty.ObjectVal(locals),
	}}
}

func known(attribute *hcl.Attribute, context *hcl.EvalContext) (cty.Value, bool) {
	if attribute == nil {
		return cty.NilVal, false
	}
	value, diags := attribute.Expr.Value(context)
	if diags.HasErrors() || value.IsNull() || !value.IsWhollyKnown() {
		return cty.NilVal, false
	}
	return value, true
}
