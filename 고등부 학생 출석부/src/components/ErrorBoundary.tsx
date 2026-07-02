'use client';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>화면을 표시할 수 없습니다</div>
          <div style={{ color: 'var(--text3)', fontSize: 11, marginBottom: 12 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '6px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12 }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
