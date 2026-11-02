// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FinNova Bank
/// @notice A minimal on-chain bank. Every address has its own account balance, held by this
///         contract in ether. Customers can deposit, withdraw, transfer to another address and
///         check their balance. Every movement emits an event, so the full history is on chain.
contract FinNovaBank {
    /// @dev Account balances in wei, one per blockchain address.
    mapping(address => uint256) private balances;

    event Deposited(address indexed account, uint256 amount, uint256 newBalance, uint256 timestamp);
    event Withdrawn(address indexed account, uint256 amount, uint256 newBalance, uint256 timestamp);
    event Transferred(address indexed from, address indexed to, uint256 amount, uint256 timestamp);

    /// @notice Deposit the ether sent with this call into the caller's account.
    function deposit() external payable {
        _deposit();
    }

    /// @notice Withdraw `amount` wei from the caller's account back to their address.
    function withdraw(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // Update the balance before sending ether (checks-effects-interactions), so a
        // re-entrant call cannot withdraw the same funds twice.
        balances[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount, balances[msg.sender], block.timestamp);

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Ether transfer failed");
    }

    /// @notice Move `amount` wei from the caller's account to the account of `to`.
    function transfer(address to, uint256 amount) external {
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot transfer to yourself");
        require(amount > 0, "Amount must be greater than zero");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transferred(msg.sender, to, amount, block.timestamp);
    }

    /// @notice The caller's current account balance in wei.
    function checkBalance() external view returns (uint256) {
        return balances[msg.sender];
    }

    /// @notice Account balance of any address, in wei.
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    /// @notice Total ether held by the bank (the sum of all account balances).
    function totalDeposits() external view returns (uint256) {
        return address(this).balance;
    }

    /// @dev Plain ether sent to the contract (no function call) counts as a deposit.
    receive() external payable {
        _deposit();
    }

    function _deposit() private {
        require(msg.value > 0, "Deposit must be greater than zero");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value, balances[msg.sender], block.timestamp);
    }
}
