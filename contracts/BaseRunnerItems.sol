// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin v5 — install with:
//   forge install OpenZeppelin/openzeppelin-contracts
// or use Remix with import from npm.

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  BaseRunnerItems
 * @notice Single ERC-1155 contract for all Base Runner cosmetics.
 *
 * Token ID ranges:
 *   0–9   Skins  (0=CryptoKid, 1=StreetRunner, 2=Builder, 3=Founder, 4=BaseKing)
 *   10–19 Trails (10=Sparkle, 11=Hearts, 12=Fire, 13=Coins, 14=Rainbow)
 *
 * Minting is gated by an off-chain EIP-191 signature from `signer`.
 * The server signs keccak256(abi.encodePacked(user, tokenId, chainId))
 * after verifying the player owns the item in Redis.
 */
contract BaseRunnerItems is ERC1155, Ownable {
    using ECDSA for bytes32;

    string public name   = "Base Runner Items";
    string public symbol = "BRI";

    address public signer;
    string  private _baseTokenURI;

    /// @dev Prevents double-claiming the same tokenId per address.
    mapping(address => mapping(uint256 => bool)) public claimed;

    event ItemClaimed(address indexed user, uint256 indexed tokenId);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);

    constructor(address _signer, string memory baseTokenURI_)
        ERC1155(baseTokenURI_)
        Ownable(msg.sender)
    {
        signer       = _signer;
        _baseTokenURI = baseTokenURI_;
    }

    // ── Claim ────────────────────────────────────────────────────────────────

    /**
     * @param tokenId  Item token ID (see ranges above).
     * @param sig      EIP-191 signature from backend signer over
     *                 keccak256(abi.encodePacked(msg.sender, tokenId, block.chainid)).
     */
    function claim(uint256 tokenId, bytes calldata sig) external {
        require(!claimed[msg.sender][tokenId], "Already claimed");

        bytes32 hash = keccak256(
            abi.encodePacked(msg.sender, tokenId, block.chainid)
        );
        address recovered = MessageHashUtils
            .toEthSignedMessageHash(hash)
            .recover(sig);
        require(recovered == signer, "Invalid signature");

        claimed[msg.sender][tokenId] = true;
        _mint(msg.sender, tokenId, 1, "");
        emit ItemClaimed(msg.sender, tokenId);
    }

    // ── Metadata ─────────────────────────────────────────────────────────────

    function uri(uint256 id) public view override returns (string memory) {
        return string(
            abi.encodePacked(_baseTokenURI, Strings.toString(id), ".json")
        );
    }

    /// @notice ERC-7572 / OpenSea collection metadata.
    function contractURI() external pure returns (string memory) {
        return "https://baserunnerapp.vercel.app/nft/collection.json";
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setSigner(address _signer) external onlyOwner {
        emit SignerUpdated(signer, _signer);
        signer = _signer;
    }

    function setBaseTokenURI(string memory baseTokenURI_) external onlyOwner {
        _baseTokenURI = baseTokenURI_;
        emit URI(baseTokenURI_, 0);
    }
}
