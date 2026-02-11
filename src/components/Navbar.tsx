import { Link, useNavigate } from "react-router-dom";
import { Search, Menu, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
const NAV_LINKS = [{
  label: "الرئيسية",
  to: "/"
}, {
  label: "قائمة الأنمي",
  to: "/browse"
}, {
  label: "جدول المواعيد",
  to: "/schedule"
}, {
  label: "قادم قريباً",
  to: "/upcoming"
}, {
  label: "الأنمي الموسمي",
  to: "/browse?filter=seasonal"
}, {
  label: "الأكثر شعبية",
  to: "/browse?filter=popular"
}, {
  label: "أفلام الأنمي",
  to: "/browse?filter=movies"
}];
export default function Navbar() {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
      setMobileOpen(false);
    }
  };
  return <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1 font-bold shrink-0">
          <span className="text-accent text-xl">أنمي</span><span className="text-primary text-2xl">zero</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(link => <Link key={link.to} to={link.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {link.label}
            </Link>)}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="hidden md:flex items-center gap-2 flex-1 max-w-xs">
          <div className="relative w-full">
            <Input placeholder="ابحث عن أنمي..." value={query} onChange={e => setQuery(e.target.value)} className="pr-3 pl-9 h-9 bg-secondary border-border text-sm" />
            <button type="submit" className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Mobile toggle */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && <div className="md:hidden border-t border-border bg-background p-4 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input placeholder="ابحث عن أنمي..." value={query} onChange={e => setQuery(e.target.value)} className="bg-secondary border-border text-sm" />
            <Button type="submit" size="icon" variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </form>
          {NAV_LINKS.map(link => <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground py-1">
              {link.label}
            </Link>)}
        </div>}
    </nav>;
}