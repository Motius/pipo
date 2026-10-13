package update

import "testing"

func TestSubjectCN(t *testing.T) {
	cases := []struct {
		subject string
		want    string
		ok      bool
	}{
		{`CN=pipo Inc, O=pipo Inc, L=Dover, S=Delaware, C=US`, "pipo Inc", true},
		{`O=pipo Inc, CN=pipo Inc, C=US`, "pipo Inc", true},
		{`CN="pipo, Inc.", O=pipo, C=US`, "pipo, Inc.", true}, // quoted value keeps its comma
		{`CN=pipo\, Inc., O=pipo`, "pipo, Inc.", true},        // escaped comma too
		{`O=pipo Inc, C=US`, "", false},                           // no CN at all
		{`OU=CN=Attacker, O=Evil Corp`, "", false},                  // CN only inside another RDN
	}
	for _, c := range cases {
		got, ok := subjectCN(c.subject)
		if ok != c.ok || got != c.want {
			t.Errorf("subjectCN(%q) = (%q, %v), want (%q, %v)", c.subject, got, ok, c.want, c.ok)
		}
	}
}

// The pin must not accept a certificate that merely embeds the expected name
// somewhere else in its subject — the substring bug this parsing replaced.
func TestSubjectCNRejectsEmbeddedPin(t *testing.T) {
	subject := `CN=Totally Different Publisher, OU=CN=pipo Inc, O=Evil Corp`
	cn, ok := subjectCN(subject)
	if !ok {
		t.Fatal("expected a CN")
	}
	if cn == "pipo Inc" {
		t.Errorf("parsed CN %q — an OU-embedded pin must not win", cn)
	}
}
