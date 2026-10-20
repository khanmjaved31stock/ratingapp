import "./globals.css";

export const metadata = {
  title: "Ratewell",
  description: "A secure rating portal.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}