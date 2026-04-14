/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import BalanceSheet from './components/BalanceSheet';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <BalanceSheet />
      </div>
    </ErrorBoundary>
  );
}
