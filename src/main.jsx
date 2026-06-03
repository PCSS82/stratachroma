import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0d0c0a', color: '#c8a96e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Courier New',monospace", padding: 24, textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: 9, color: '#666', marginBottom: 10, letterSpacing: '.15em' }}>
              STRATACHROMA · ERROR DE CARGA
            </div>
            <div style={{ fontSize: 11, color: '#e07870', marginBottom: 24, lineHeight: 1.8 }}>
              {this.state.error.message || 'Error desconocido'}
            </div>
            <button
              onClick={() => { try { localStorage.clear() } catch {} window.location.reload() }}
              style={{
                background: 'rgba(200,169,110,.14)', border: '1px solid rgba(200,169,110,.35)',
                color: '#c8a96e', padding: '12px 24px', fontFamily: "'Courier New',monospace",
                fontSize: 11, cursor: 'pointer', borderRadius: 3, letterSpacing: '.1em',
                textTransform: 'uppercase'
              }}
            >
              Reiniciar app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
