import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card mt-12">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-3">
              <span className="text-accent">أنمي</span>
              <span className="text-primary">zero</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              موقعك المفضل لمشاهدة الأنمي المترجم بجودة عالية
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3">روابط سريعة</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <Link to="/" className="block hover:text-foreground">الرئيسية</Link>
              <Link to="/browse" className="block hover:text-foreground">قائمة الأنمي</Link>
              <Link to="/browse?filter=popular" className="block hover:text-foreground">الأكثر شعبية</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-3">معلومات</h4>
            <p className="text-sm text-muted-foreground">
              موقعك المفضل لمشاهدة الأنمي المترجم بجودة عالية
            </p>
          </div>
        </div>
        <div className="border-t border-border mt-6 pt-4 text-center text-xs text-muted-foreground">
          أنميzero © {new Date().getFullYear()} — جميع الحقوق محفوظة
        </div>
      </div>
    </footer>
  );
}
