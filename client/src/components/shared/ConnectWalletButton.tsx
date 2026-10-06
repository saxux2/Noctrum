"use client";

import { usePrivy } from "@privy-io/react-auth";

const ConnectWalletButton = () => {
  const { login, logout, authenticated, user } = usePrivy();

  const walletAddress = user?.wallet?.address;

  if (authenticated) {
    return (
      <button
        onClick={logout}
        className="w-full text-gray-900 font-medium py-4 rounded-2xl transition-colors cursor-pointer text-lg"
        style={{ backgroundColor: "#e2a9f1" }}
      >
        {walletAddress
          ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
          : "Disconnect"}
      </button>
    );
  }

  return (
    <button
      onClick={login}
      className="w-full text-gray-900 font-medium py-4 rounded-2xl transition-colors cursor-pointer text-lg"
      style={{ backgroundColor: "#e2a9f1" }}
    >
      Connect Wallet
    </button>
  );
};

export default ConnectWalletButton;
