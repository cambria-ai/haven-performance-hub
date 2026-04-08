import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Haven Performance Hub",
  description: "Performance analytics for Haven Real Estate Group",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
