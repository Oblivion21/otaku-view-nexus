import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AnnouncementBanner from "@/components/AnnouncementBanner";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AnnouncementBanner />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
