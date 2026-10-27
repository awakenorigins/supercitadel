import sys, json
d = json.load(sys.stdin)
print("from", d.get("from"), "to", d.get("to"), "yearStart", d.get("yearStart"))
print("balanced:", d.get("balanced"))
t = d.get("totals", {})
for k in ("openDebit","openCredit","periodDebit","periodCredit","accumDebit","accumCredit","closeDebit","closeCredit"):
    print(" ", k, t.get(k))
rows = d.get("rows", [])
print("rows:", len(rows))
for r in rows[:15]:
    p = "P" if r["isParent"] else " "
    print("  L%d %s %-8s %-28s openD=%s perD=%s perC=%s closeD=%s closeC=%s" % (
        r["level"], p, r["code"], r["name"][:28],
        r["openDebit"], r["periodDebit"], r["periodCredit"], r["closeDebit"], r["closeCredit"]))
