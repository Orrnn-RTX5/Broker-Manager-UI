import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6 text-[#1e293b] font-sans">
          <div className="max-w-md w-full bg-white border border-[#e2e8f0] rounded-2xl p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-[#fff1f2] bg-[#fef2f2]">
              <AlertCircle className="w-8 h-8 text-[#ef4444]" />
            </div>
            
            <h1 className="text-2xl font-bold mb-3 text-[#0f172a]">Application Error</h1>
            <p className="text-[#64748b] mb-10 text-sm leading-relaxed px-4">
              Something went wrong while processing the requested action. Your data hasn't been affected.
            </p>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 px-6 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-100"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Terminal
              </button>
              
              <button
                onClick={() => {
                  window.location.href = '/';
                  this.setState({ hasError: false });
                }}
                className="w-full py-3 px-6 bg-white hover:bg-[#f1f5f9] border border-[#e2e8f0] text-[#475569] rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <Home className="w-4 h-4" />
                Back to Dashboard
              </button>
            </div>
            
            {import.meta.env.DEV && (
              <div className="mt-8 text-left border-t border-[#f1f5f9] pt-6">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-widest font-bold mb-2">Technical Details</p>
                <div className="bg-[#f8fafc] rounded-lg p-4 border border-[#e2e8f0]">
                  <pre className="text-[11px] font-mono text-[#ef4444]/80 overflow-auto max-h-32 whitespace-pre-wrap">
                    {this.state.error?.toString()}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
