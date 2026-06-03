import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  public handleCopy = () => {
    const errorText = `
CRM SYSTEM ERROR REPORT
=======================
Date: ${new Date().toISOString()}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

Error:
${this.state.error?.toString() || "Unknown Error"}

Component Stack:
${this.state.errorInfo?.componentStack || "No Stack Trace"}
`.trim();

    navigator.clipboard.writeText(errorText)
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch((err) => console.error("Failed to copy error details", err));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-550 flex items-center justify-center p-6 font-sans">
          <div className="w-full max-w-4xl bg-white rounded-[32px] border border-rose-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Header */}
            <div className="bg-gradient-to-r from-rose-500 to-red-600 p-8 text-white">
              <div className="flex items-center gap-4">
                <span className="text-4xl select-none">⚠️</span>
                <div>
                  <h1 className="text-xl font-black uppercase tracking-wider">Application Runtime Exception</h1>
                  <p className="text-xs text-rose-100 mt-1 font-semibold uppercase tracking-wide">
                    An error has crashed the client-side state. Let's inspect it together.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8">
              {/* Error Message Details */}
              <div className="mb-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">Error Message:</h3>
                <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 shadow-inner">
                  <pre className="text-xs font-mono font-bold text-rose-600 overflow-x-auto whitespace-pre-wrap select-all">
                    {this.state.error?.toString()}
                  </pre>
                </div>
              </div>

              {/* Component Stack Trace */}
              {this.state.errorInfo && (
                <div className="mb-8">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">Stack Trace:</h3>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-md">
                    <pre className="text-[10px] font-mono text-emerald-400 bg-slate-950/70 p-3 rounded-xl overflow-x-auto overflow-y-auto max-h-60 whitespace-pre select-all leading-relaxed">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3.5 border-t border-slate-100 pt-6">
                <button
                  onClick={this.handleCopy}
                  className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow active:scale-95 flex items-center gap-2 ${
                    this.state.copied 
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {this.state.copied ? "✅ Copied Error Details!" : "📋 Copy Error Details"}
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow active:scale-95 flex items-center gap-2"
                >
                  🔄 Just Reload Page
                </button>
                <button
                  onClick={() => {
                    sessionStorage.clear();
                    window.location.reload();
                  }}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center gap-2"
                >
                  🧹 Clear active session cache & reload
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
