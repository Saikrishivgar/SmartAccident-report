import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Smart Accident Risk System",
  description:
    "Predict accident-prone areas using weather, time, traffic, and historical data"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="siteHeader">
          <Link href="/" className="brand">
            <span className="brandMark" />
            <span>
              Smart Accident
              <small>Command Center</small>
            </span>
          </Link>
          <nav className="siteNav">
            <Link href="/">Home</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/alerts">Alerts</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
