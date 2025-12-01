const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  const Registry = await hre.ethers.getContractFactory('PolyGuardRegistry');
  const registry = await Registry.deploy();
  await registry.deployed();

  console.log('PolyGuardRegistry deployed to:', registry.address);

  // If HASH env variable provided, register it
  const hashHex = process.env.HASH || '';
  if (hashHex) {
    // expect hex string like 0x...
    console.log('Registering hash on-chain:', hashHex);
    const tx = await registry.register(hashHex, { gasPrice: 0 });
    const receipt = await tx.wait();
    console.log('Registration transaction hash:', receipt.transactionHash);
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
