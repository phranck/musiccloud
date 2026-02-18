import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

interface EbStrings {
  title: string;
  message: string;
  reload: string;
}

const EB_STRINGS: Record<string, EbStrings> = {
  de: {
    title: "Etwas ist schiefgelaufen",
    message: "Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.",
    reload: "Seite neu laden",
  },
  fr: {
    title: "Une erreur s'est produite",
    message: "Une erreur inattendue s'est produite. Veuillez recharger la page.",
    reload: "Recharger la page",
  },
  it: {
    title: "Qualcosa è andato storto",
    message: "Si è verificato un errore imprevisto. Ricarica la pagina.",
    reload: "Ricarica la pagina",
  },
  es: {
    title: "Algo salió mal",
    message: "Ocurrió un error inesperado. Por favor, recarga la página.",
    reload: "Recargar la página",
  },
  pt: {
    title: "Algo correu mal",
    message: "Ocorreu um erro inesperado. Por favor, recarregue a página.",
    reload: "Recarregar página",
  },
  nl: {
    title: "Er is iets misgegaan",
    message: "Er is een onverwachte fout opgetreden. Probeer de pagina opnieuw te laden.",
    reload: "Pagina herladen",
  },
  tr: {
    title: "Bir şeyler ters gitti",
    message: "Beklenmedik bir hata oluştu. Lütfen sayfayı yeniden yükleyin.",
    reload: "Sayfayı yenile",
  },
};

const EB_DEFAULT: EbStrings = {
  title: "Something went wrong",
  message: "An unexpected error occurred. Please try reloading the page.",
  reload: "Reload page",
};

function getEbStrings(): EbStrings {
  try {
    const locale = localStorage.getItem("mc:locale") ?? "en";
    return EB_STRINGS[locale] ?? EB_DEFAULT;
  } catch {
    return EB_DEFAULT;
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error.message, error.stack);
    }
  }

  render() {
    if (this.state.hasError) {
      const s = getEbStrings();
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">{s.title}</h1>
          <p className="text-text-secondary mb-6">{s.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            {s.reload}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
