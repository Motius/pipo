package update

import "testing"

// RFC 4514 escapes other than \, must also be reversed — otherwise a CN like
// `pipo \+ Co` never EqualFold-matches the pin and a legitimately signed
// payload is refused at exit 3.
func TestSubjectCNUnescapesAllSpecials(t *testing.T) {
	cases := map[string]string{
		`CN=pipo \+ Co, O=pipo`:   "pipo + Co",
		`CN=pipo \; Co`:             "pipo ; Co",
		`CN=pipo \= Co`:             "pipo = Co",
		`CN=pipo \\ Co`:             `pipo \ Co`,
		`CN=pipo \" Co`:             `pipo " Co`,
		`CN=pipo \3C Co`:            "pipo < Co", // hex escape
		`CN=pipo\, Inc., O=pipo`:  "pipo, Inc.",
		`CN=Plain Company Name, C=US`: "Plain Company Name",
	}
	for subject, want := range cases {
		got, ok := subjectCN(subject)
		if !ok {
			t.Errorf("%q: no CN found", subject)
			continue
		}
		if got != want {
			t.Errorf("subjectCN(%q) = %q, want %q", subject, got, want)
		}
	}
}
