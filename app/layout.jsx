import './globals.css';

export const metadata = {
  title: 'EMPATIA',
  description: 'Un dia en la vida de Luisa',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
