import "./globals.css";

export const metadata = {
  title: "Norte House Burger — Painel de gestão",
  description: "Precificação, cardápio e vendas em um só lugar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
