import type { Wallet } from "../hooks/useWallet";
import { Alert, AuthBackdrop, Icon, Spinner } from "../ui";

/** Shown until a MetaMask account is connected. Same split layout as the web app's sign-in page. */
export function ConnectScreen({ wallet }: { wallet: Wallet }) {
  return (
    <div className="auth">
      <AuthBackdrop />
      <section className="auth-hero">
        <div className="logo">
          <div className="logo-mark">F</div>
          FinNova <span className="dapp-tag">DApp</span>
        </div>
        <div>
          <h2>Your bank account, on the blockchain.</h2>
          <p>Connect MetaMask to deposit, withdraw and transfer ether through the FinNova Bank smart contract.</p>
          <div className="hero-list">
            <div>
              <span className="ico"><Icon name="arrow-down-left" size={18} /></span> Deposit and withdraw ETH
            </div>
            <div>
              <span className="ico"><Icon name="send" size={18} /></span> Transfer to any blockchain address
            </div>
            <div>
              <span className="ico"><Icon name="shield" size={18} /></span> Every transaction recorded on chain
            </div>
          </div>
        </div>
        <p className="small" style={{ opacity: 0.55, marginTop: 0 }}>FinNova Bank · local blockchain</p>
      </section>
      <section className="auth-form">
        <div className="card auth-card">
          <div>
            <h1>Connect your wallet</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              FinNova never sees your keys. MetaMask asks you to approve every transaction.
            </p>
          </div>

          {wallet.status === "unavailable" ? (
            <>
              <Alert kind="warn">MetaMask was not found in this browser.</Alert>
              <a className="btn btn-primary btn-lg btn-block" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>
              <p className="hint">After installing it, reload this page.</p>
            </>
          ) : (
            <>
              {wallet.error && <Alert>{wallet.error}</Alert>}
              <button className="btn btn-primary btn-lg btn-block" onClick={wallet.connect} disabled={wallet.status === "connecting"}>
                {wallet.status === "connecting" ? (
                  <>
                    <Spinner /> Waiting for MetaMask…
                  </>
                ) : (
                  <>
                    <Icon name="wallet" size={20} /> Connect MetaMask
                  </>
                )}
              </button>
              <div className="demo">
                <strong className="small">Local blockchain</strong>
                <span className="small muted">
                  Run <code>bun run chain</code> and add the network to MetaMask: RPC <code>http://127.0.0.1:8545</code>, chain ID{" "}
                  <code>1337</code>, symbol <code>ETH</code>.
                </span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
