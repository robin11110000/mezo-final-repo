// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRedemptionManager {
    function musdToken() external view returns (address);
    function redeemCollateral(uint256 amount,address first,address upper,address lower,uint256 nicr,uint256 iterations) external;
}

/// @notice Owner-funded, bounded MUSD-to-BTC redemptions; never operates a borrower's own trove.
contract BtcRedemptionAccount is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error Unauthorized();
    error InvalidConfiguration();
    error PolicyViolation();
    error UnexpectedFlow();
    struct Policy {
        uint256 reserve;
        uint256 maxPerExecution;
        uint256 remainingBudget;
        uint256 minBtcPerMusd; // 1e18-scaled native BTC units per whole MUSD.
        uint64 cooldown;
        uint64 expiresAt;
        uint16 keeperFeeBps;
        bool active;
    }
    struct Request {
        uint256 amount;
        address first;
        address upper;
        address lower;
        uint256 nicr;
        uint256 iterations;
        uint256 minBtc;
        uint64 deadline;
    }
    address public immutable owner;
    IERC20 public immutable musd;
    IRedemptionManager public immutable manager;
    Policy public policy;
    uint256 public lastExecution;
    mapping(address=>bool) public keepers;
    event Funded(uint256 amount);
    event PolicyUpdated(Policy policy);
    event KeeperUpdated(address indexed keeper,bool allowed);
    event Redeemed(address indexed caller,uint256 requested,uint256 spent,uint256 btcReceived,uint256 keeperFee);
    event Withdrawn(uint256 musdAmount,uint256 btcAmount);
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    constructor(address token,address troveManager,address accountOwner){
        if(block.chainid!=31611||token.code.length==0||troveManager.code.length==0||accountOwner==address(0))revert InvalidConfiguration();
        owner=accountOwner;musd=IERC20(token);manager=IRedemptionManager(troveManager);
        if(manager.musdToken()!=token)revert InvalidConfiguration();
    }
    receive() external payable {}
    function fund(uint256 amount) external onlyOwner nonReentrant {
        if(amount==0)revert PolicyViolation();uint256 beforeBalance=musd.balanceOf(address(this));
        musd.safeTransferFrom(owner,address(this),amount);
        if(musd.balanceOf(address(this))-beforeBalance!=amount)revert UnexpectedFlow();emit Funded(amount);
    }
    function setPolicy(Policy calldata next) external onlyOwner {
        if(next.keeperFeeBps>100||next.cooldown>7 days||
            (next.active&&(next.minBtcPerMusd==0||next.maxPerExecution==0||next.remainingBudget==0||next.expiresAt<=block.timestamp)))revert PolicyViolation();
        policy=next;emit PolicyUpdated(next);
    }
    function setKeeper(address keeper,bool allowed) external onlyOwner {keepers[keeper]=allowed;emit KeeperUpdated(keeper,allowed);}
    function revoke() external onlyOwner {policy.active=false;emit PolicyUpdated(policy);}
    function execute(Request calldata r) external nonReentrant returns (uint256,uint256,uint256) {
        if(msg.sender!=owner&&!keepers[msg.sender])revert Unauthorized();
        Policy memory p=policy;
        if(!p.active||block.timestamp>=p.expiresAt||block.timestamp>r.deadline||r.deadline>block.timestamp+10 minutes||r.iterations==0||r.iterations>100||r.minBtc==0)revert PolicyViolation();
        if(r.amount==0||r.amount>p.maxPerExecution||r.amount>p.remainingBudget||
            (lastExecution!=0&&block.timestamp<lastExecution+p.cooldown))revert PolicyViolation();
        uint256 beforeMusd=musd.balanceOf(address(this));uint256 beforeBtc=address(this).balance;
        uint256 maxFee=msg.sender==owner?0:r.amount*p.keeperFeeBps/10000;
        if(beforeMusd<p.reserve||r.amount>beforeMusd-p.reserve||maxFee>beforeMusd-p.reserve-r.amount)revert PolicyViolation();
        lastExecution=block.timestamp;
        manager.redeemCollateral(r.amount,r.first,r.upper,r.lower,r.nicr,r.iterations);
        uint256 afterMusd=musd.balanceOf(address(this));
        if(afterMusd>beforeMusd||address(this).balance<beforeBtc)revert UnexpectedFlow();
        uint256 spent=beforeMusd-afterMusd;uint256 received=address(this).balance-beforeBtc;
        if(spent==0||spent>r.amount||received<r.minBtc||received==0)revert UnexpectedFlow();
        // Ceiling division prevents rounding from allowing a below-policy exchange rate.
        uint256 required=(spent*p.minBtcPerMusd+1e18-1)/1e18;
        if(received<required)revert PolicyViolation();
        uint256 fee=msg.sender==owner?0:spent*p.keeperFeeBps/10000;
        policy.remainingBudget-=spent;
        if(fee!=0)musd.safeTransfer(msg.sender,fee);
        if(musd.balanceOf(address(this))<p.reserve)revert UnexpectedFlow();
        emit Redeemed(msg.sender,r.amount,spent,received,fee);
        return (spent,received,fee);
    }
    /// @notice Exits remain available after policy revocation or expiry. All proceeds go to owner.
    function withdraw(uint256 musdAmount,uint256 btcAmount) external onlyOwner nonReentrant {
        if(musdAmount!=0)musd.safeTransfer(owner,musdAmount);
        if(btcAmount!=0){(bool ok,)=payable(owner).call{value:btcAmount}("");if(!ok)revert UnexpectedFlow();}
        emit Withdrawn(musdAmount,btcAmount);
    }
}
