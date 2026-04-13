const fs = require('fs').promises;
const path = require('path');

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/srs-platform/projects';

async function getDirSizeMb(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let totalBytes = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalBytes += await getDirSizeBytes(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        totalBytes += stat.size;
      }
    }
    return totalBytes / (1024 * 1024);
  } catch (err) {
    return 0;
  }
}

async function getDirSizeBytes(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSizeBytes(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  } catch (err) {
    return 0;
  }
}

function validateProjectPath(projectId) {
  const projectPath = path.join(STORAGE_ROOT, String(projectId));
  const resolved = path.resolve(projectPath);
  const rootResolved = path.resolve(STORAGE_ROOT);
  
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error('Invalid project path');
  }
  
  return projectPath;
}

async function getStorageUsage(projects) {
  const projectUsages = [];
  let totalMb = 0;
  
  for (const project of projects) {
    try {
      const projectPath = path.join(STORAGE_ROOT, String(project.id));
      const sizeMb = await getDirSizeMb(projectPath);
      projectUsages.push({ id: project.id, name: project.name, size_mb: Math.round(sizeMb * 100) / 100 });
      totalMb += sizeMb;
    } catch (err) {
      projectUsages.push({ id: project.id, name: project.name, size_mb: 0 });
    }
  }
  
  return { total_mb: Math.round(totalMb * 100) / 100, projects: projectUsages };
}

async function deleteProjectFiles(projectId) {
  const projectPath = validateProjectPath(projectId);
  try {
    await fs.rm(projectPath, { recursive: true, force: true });
  } catch (err) {
    console.error('Error deleting project files:', err.message);
  }
}

async function ensureProjectDir(projectId) {
  const projectPath = validateProjectPath(projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return projectPath;
}

module.exports = {
  validateProjectPath,
  getStorageUsage,
  deleteProjectFiles,
  ensureProjectDir,
  getDirSizeMb,
  STORAGE_ROOT
};
