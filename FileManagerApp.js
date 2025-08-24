/**
 * Comprehensive File Manager - React Native App
 *
 * This single-file application provides a powerful tool for managing device and
 * cloud storage. It can identify and remove duplicate files, large files,
 * cache, and other unnecessary data from both local storage and Google Drive.
 *
 * @format
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  Button,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';

//==============================================================================
// MOCK SERVICES
// In a real-world application, these would be actual libraries installed via npm.
// They are mocked here to provide a complete, runnable example without needing
// native dependencies or a complex setup.
//==============================================================================

/**
 * Mock implementation of the '@react-native-google-signin/google-signin' library.
 * Simulates the Google Sign-In and Sign-Out process.
 */
const mockGoogleSignin = {
  signIn: async () => {
    console.log('Attempting Google Sign-In...');
    // In a real app, this would open a native Google Sign-In prompt.
    // Here, we simulate a successful login and return a mock user object.
    return {
      user: {
        email: 'user@example.com',
        name: 'Test User',
        photo: 'https://example.com/avatar.png',
      },
    };
  },
  signOut: async () => {
    console.log('Signing out...');
    // In a real app, this would clear the user's session.
    return null;
  },
};

/**
 * Mock implementation of the 'react-native-fs' library.
 * Simulates file system operations like reading directories, hashing, and deleting.
 */
const mockRNFS = {
  DocumentDirectoryPath: '/data/user/0/com.filemanager/files',
  CachesDirectoryPath: '/data/user/0/com.filemanager/cache',

  readDir: async (path) => {
    console.log(`Reading directory: ${path}`);
    // This mock returns a predefined set of files to simulate a real file system.
    if (path.includes('WhatsApp')) {
        return [
            { name: 'IMG-20230101-WA0001.jpg', path: `${path}/IMG-20230101-WA0001.jpg`, size: 2 * 1024 * 1024, isFile: () => true },
            { name: 'VID-20230102-WA0002.mp4', path: `${path}/VID-20230102-WA0002.mp4`, size: 60 * 1024 * 1024, isFile: () => true },
        ];
    }
    return [
      { name: 'photo1.jpg', path: `${path}/photo1.jpg`, size: 2 * 1024 * 1024, isFile: () => true },
      { name: 'document.pdf', path: `${path}/document.pdf`, size: 5 * 1024 * 1024, isFile: () => true },
      { name: 'photo1_copy.jpg', path: `${path}/photo1_copy.jpg`, size: 2 * 1024 * 1024, isFile: () => true }, // Duplicate
      { name: 'large_video.mp4', path: `${path}/large_video.mp4`, size: 150 * 1024 * 1024, isFile: () => true }, // Large
      { name: 'temp_data.tmp', path: `${path}/temp_data.tmp`, size: 512 * 1024, isFile: () => true }, // Junk
    ];
  },

  hash: async (filepath, algorithm) => {
    console.log(`Hashing ${filepath} with ${algorithm}`);
    // To simulate finding duplicates, we return a fixed hash for files with "copy" in their name.
    if (filepath.includes('copy')) {
      return 'd8e8fca2dc0f896fd7cb4cb0031ba249';
    }
    // For all other files, return a random hash.
    return Math.random().toString(36).substring(2, 15);
  },

  unlink: async (filepath) => {
    console.log(`DELETING LOCAL FILE: ${filepath}`);
    // In a real app, this would permanently delete the file from the device.
    return;
  },
};

/**
 * Mock implementation of the 'googleapis' library for Google Drive interactions.
 */
const mockGoogleApis = {
    drive: (v3) => ({
      files: {
        list: async (options) => {
            console.log('Listing Google Drive files...');
            // Returns a mock list of files found in the user's Google Drive.
            return {
                data: {
                    files: [
                        { id: 'gdrive_id_1', name: 'MyPresentation.pptx', size: 10 * 1024 * 1024 },
                        { id: 'gdrive_id_2', name: 'MyPresentation_copy.pptx', size: 10 * 1024 * 1024 }, // Duplicate
                        { id: 'gdrive_id_3', name: 'archive.zip', size: 200 * 1024 * 1024 }, // Large
                    ]
                }
            }
        },
        delete: async ({ fileId }) => {
            console.log(`DELETING GDRIVE FILE: ${fileId}`);
            // In a real app, this would permanently delete the file from Google Drive.
            return {};
        }
      }
    })
};


//==============================================================================
// HELPER FUNCTIONS & REUSABLE COMPONENTS
//==============================================================================

/**
 * Utility function to format file sizes from bytes into a human-readable string.
 * @param {number} bytes - The file size in bytes.
 * @param {number} decimals - The number of decimal places to display.
 * @returns {string} A formatted string like "1.23 MB".
 */
const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * A reusable component to display a single file item in a list.
 * It includes a checkbox for selection and shows file details.
 * @param {{item: object, onSelect: function, isSelected: boolean}} props
 */
const FileItem = ({ item, onSelect, isSelected }) => (
    <TouchableOpacity onPress={() => onSelect(item.id)} style={styles.fileItem}>
        {/* Custom Checkbox */}
        <View style={styles.checkbox}>
            {isSelected && <View style={styles.checkboxSelected} />}
        </View>
        <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.fileDetails}>
                {formatBytes(item.size)} | {item.isGoogleDrive ? 'Google Drive' : 'Local Storage'}
            </Text>
        </View>
    </TouchableOpacity>
);

//==============================================================================
// SCREEN COMPONENTS
// Each component represents a different screen in the application.
//==============================================================================

/**
 * The main dashboard screen. Displays storage statistics and navigation to different scan types.
 * @param {{setScreen: function, status: string, userInfo: object, handleSignIn: function, handleSignOut: function}} props
 */
const DashboardScreen = ({ setScreen, status, userInfo, handleSignIn, handleSignOut }) => {
    return (
        <ScrollView contentContainerStyle={styles.container}>
            {/* Header and Authentication Section */}
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Dashboard</Text>
                {userInfo ? (
                    <View>
                        <Text style={styles.userInfo}>Welcome, {userInfo.name}</Text>
                        <TouchableOpacity style={styles.authButton} onPress={handleSignOut}>
                            <Text style={styles.authButtonText}>Sign Out</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.authButton} onPress={handleSignIn}>
                        <Text style={styles.authButtonText}>Sign in with Google</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Storage Statistics Section */}
            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Local Storage</Text>
                    <Text style={styles.statValue}>{formatBytes(156 * 1024 * 1024 * 1024)} / {formatBytes(256 * 1024 * 1024 * 1024)}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Google Drive</Text>
                    <Text style={styles.statValue}>{userInfo ? `${formatBytes(10 * 1024 * 1024 * 1024)} / ${formatBytes(15 * 1024 * 1024 * 1024)}` : 'N/A'}</Text>
                </View>
            </View>

            {/* Status message display */}
            <Text style={styles.statusText}>{status}</Text>

            {/* Scan Navigation Buttons */}
            <View style={styles.scanButtonsContainer}>
                <TouchableOpacity style={styles.scanButton} onPress={() => setScreen('DuplicateFiles')}>
                    <Text style={styles.scanButtonText}>Find Duplicate Files</Text>
                    <Text style={styles.scanButtonSubtitle}>Scan local & cloud for identical files.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanButton} onPress={() => setScreen('JunkCache')}>
                    <Text style={styles.scanButtonText}>Clean Junk & Cache</Text>
                    <Text style={styles.scanButtonSubtitle}>Remove temporary and junk files.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanButton} onPress={() => setScreen('LargeFiles')}>
                    <Text style={styles.scanButtonText}>Manage Large Files</Text>
                    <Text style={styles.scanButtonSubtitle}>Find files bigger than 50MB.</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

/**
 * Screen to display the results of the duplicate file scan.
 * @param {{setScreen: function, scan: function, results: array, deleteFiles: function}} props
 */
const DuplicateFilesScreen = ({ setScreen, scan, results, deleteFiles }) => {
    const [selectedFiles, setSelectedFiles] = useState({});

    // Trigger the scan function when the component mounts.
    useEffect(() => { scan(); }, [scan]);

    // Toggles the selection state of a file.
    const onSelect = (id) => {
        setSelectedFiles(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Gathers all selected file objects from the results.
    const getSelectedFileObjects = () => {
        const allFiles = results.flatMap(group => group.files);
        return allFiles.filter(file => selectedFiles[file.id]);
    };

    const totalSelectedSize = getSelectedFileObjects().reduce((sum, file) => sum + (file.size || 0), 0);

    // Calls the main delete function and clears the selection.
    const handleDelete = () => {
        deleteFiles(getSelectedFileObjects(), 'duplicates');
        setSelectedFiles({});
    };

    return (
        <View style={styles.resultsContainer}>
            <Button title="< Back to Dashboard" onPress={() => setScreen('Dashboard')} />
            <Text style={styles.header}>Duplicate Files</Text>
            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={({ item: group }) => (
                    <View style={styles.duplicateGroup}>
                        <Text style={styles.groupHeader}>Found {group.files.length} identical files:</Text>
                        {group.files.map(file => (
                            <FileItem
                                key={file.id}
                                item={file}
                                onSelect={() => onSelect(file.id)}
                                isSelected={!!selectedFiles[file.id]}
                            />
                        ))}
                    </View>
                )}
                ListEmptyComponent={<Text style={styles.statusText}>No duplicates found.</Text>}
            />
            <View style={styles.deleteContainer}>
                <Text style={styles.deleteSummary}>Selected: {formatBytes(totalSelectedSize)}</Text>
                <Button title="Delete Selected" onPress={handleDelete} disabled={totalSelectedSize === 0} />
            </View>
        </View>
    );
};

/**
 * Screen to display the results of the junk and cache file scan.
 * @param {{setScreen: function, scan: function, results: array, deleteFiles: function}} props
 */
const JunkCacheScreen = ({ setScreen, scan, results, deleteFiles }) => {
    const [selectedFiles, setSelectedFiles] = useState({});

    useEffect(() => { scan(); }, [scan]);

    const onSelect = (id) => {
        setSelectedFiles(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const getSelectedFileObjects = () => results.filter(file => selectedFiles[file.id]);
    const totalSelectedSize = getSelectedFileObjects().reduce((sum, file) => sum + (file.size || 0), 0);

    const handleDelete = () => {
        deleteFiles(getSelectedFileObjects(), 'junk');
        setSelectedFiles({});
    };

    return (
        <View style={styles.resultsContainer}>
            <Button title="< Back to Dashboard" onPress={() => setScreen('Dashboard')} />
            <Text style={styles.header}>Junk & Cache Files</Text>
            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <FileItem
                        item={item}
                        onSelect={() => onSelect(item.id)}
                        isSelected={!!selectedFiles[item.id]}
                    />
                )}
                ListEmptyComponent={<Text style={styles.statusText}>No junk files found.</Text>}
            />
            <View style={styles.deleteContainer}>
                <Text style={styles.deleteSummary}>Selected: {formatBytes(totalSelectedSize)}</Text>
                <Button title="Delete Selected" onPress={handleDelete} disabled={totalSelectedSize === 0} />
            </View>
        </View>
    );
};

/**
 * Screen to display the results of the large file scan.
 * @param {{setScreen: function, scan: function, results: array, deleteFiles: function}} props
 */
const LargeFilesScreen = ({ setScreen, scan, results, deleteFiles }) => {
    const [selectedFiles, setSelectedFiles] = useState({});

    useEffect(() => { scan(); }, [scan]);

    const onSelect = (id) => {
        setSelectedFiles(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const getSelectedFileObjects = () => results.filter(file => selectedFiles[file.id]);
    const totalSelectedSize = getSelectedFileObjects().reduce((sum, file) => sum + (file.size || 0), 0);

    const handleDelete = () => {
        deleteFiles(getSelectedFileObjects(), 'large');
        setSelectedFiles({});
    };

    return (
        <View style={styles.resultsContainer}>
            <Button title="< Back to Dashboard" onPress={() => setScreen('Dashboard')} />
            <Text style={styles.header}>Large Files (> 50MB)</Text>
            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <FileItem
                        item={item}
                        onSelect={() => onSelect(item.id)}
                        isSelected={!!selectedFiles[item.id]}
                    />
                )}
                ListEmptyComponent={<Text style={styles.statusText}>No large files found.</Text>}
            />
            <View style={styles.deleteContainer}>
                <Text style={styles.deleteSummary}>Selected: {formatBytes(totalSelectedSize)}</Text>
                <Button title="Delete Selected" onPress={handleDelete} disabled={totalSelectedSize === 0} />
            </View>
        </View>
    );
};


//==============================================================================
// MAIN APP COMPONENT
// This is the root component that manages state and navigation for the app.
//==============================================================================
const App = () => {
  // State for navigation, status messages, and user authentication
  const [screen, setScreen] = useState('Dashboard');
  const [status, setStatus] = useState('Ready to scan.');
  const [userInfo, setUserInfo] = useState(null);

  // State to hold the results from each type of scan
  const [duplicateFiles, setDuplicateFiles] = useState([]);
  const [junkFiles, setJunkFiles] = useState([]);
  const [largeFiles, setLargeFiles] = useState([]);

  /**
   * Handles the Google Sign-In process.
   */
  const handleSignIn = async () => {
    try {
      setStatus('Signing in...');
      const { user } = await mockGoogleSignin.signIn();
      setUserInfo(user);
      setStatus('Signed in successfully.');
    } catch (error) {
      console.error(error);
      setStatus('Sign-in failed.');
      Alert.alert('Error', 'Google Sign-In failed.');
    }
  };

  /**
   * Handles the Google Sign-Out process.
   */
  const handleSignOut = async () => {
    try {
      await mockGoogleSignin.signOut();
      setUserInfo(null);
      setStatus('Signed out.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Google Sign-Out failed.');
    }
  };

  // --- Core Scanning Logic ---

  /**
   * Scans for duplicate files both locally and in Google Drive.
   * It uses file hashing to identify true duplicates.
   */
  const scanForDuplicates = useCallback(async () => {
    setStatus('Scanning for duplicates...');
    const hashes = {};
    const foundDuplicates = [];

    // 1. Scan local files
    const localFiles = await mockRNFS.readDir(mockRNFS.DocumentDirectoryPath);
    for (const file of localFiles) {
      if (file.isFile()) {
        const hash = await mockRNFS.hash(file.path, 'sha256');
        if (hashes[hash]) {
          hashes[hash].push({ ...file, id: file.path });
        } else {
          hashes[hash] = [{ ...file, id: file.path }];
        }
      }
    }

    // 2. Scan Google Drive files if user is signed in
    if (userInfo) {
        const drive = mockGoogleApis.drive('v3');
        const gdriveFiles = await drive.files.list();
        for (const file of gdriveFiles.data.files) {
            // NOTE: Real GDrive hashing would require downloading the file, which is slow.
            // We simulate it by checking for "_copy" in the filename.
            const pseudoHash = file.name.includes('_copy') ? `gdrive_${file.name.replace('_copy', '')}` : `gdrive_${file.name}`;
            if (hashes[pseudoHash]) {
                hashes[pseudoHash].push({ ...file, id: file.id, isGoogleDrive: true });
            } else {
                hashes[pseudoHash] = [{ ...file, id: file.id, isGoogleDrive: true }];
            }
        }
    }

    // 3. Filter for groups with more than one file (i.e., duplicates)
    for (const hash in hashes) {
      if (hashes[hash].length > 1) {
        foundDuplicates.push({ id: hash, files: hashes[hash] });
      }
    }

    setDuplicateFiles(foundDuplicates);
    setStatus(`Scan complete. Found ${foundDuplicates.length} groups of duplicates.`);
  }, [userInfo]); // Re-run if userInfo changes

  /**
   * Scans for junk files like temporary files and cache.
   */
  const scanForJunk = useCallback(async () => {
    setStatus('Scanning for junk files...');
    const foundJunk = [];

    const cacheFiles = await mockRNFS.readDir(mockRNFS.CachesDirectoryPath);
    for (const file of cacheFiles) {
      if (file.name.endsWith('.tmp') || file.name.endsWith('.log')) {
        foundJunk.push({ ...file, id: file.path });
      }
    }

    setJunkFiles(foundJunk);
    setStatus(`Scan complete. Found ${foundJunk.length} junk files.`);
  }, []);

  /**
   * Scans for files larger than a defined threshold (50MB).
   * Includes a specific check for WhatsApp media folders.
   */
  const scanForLargeFiles = useCallback(async () => {
    setStatus('Scanning for large files...');
    const foundLarge = [];
    const sizeThreshold = 50 * 1024 * 1024; // 50 MB

    // 1. Scan general local files
    const localFiles = await mockRNFS.readDir(mockRNFS.DocumentDirectoryPath);
    for (const file of localFiles) {
      if (file.isFile() && file.size > sizeThreshold) {
        foundLarge.push({ ...file, id: file.path });
      }
    }

    // 2. Scan WhatsApp media folder
    const whatsappFiles = await mockRNFS.readDir(`${mockRNFS.DocumentDirectoryPath}/WhatsApp/Media`);
    for (const file of whatsappFiles) {
        if (file.isFile() && file.size > sizeThreshold) {
            foundLarge.push({ ...file, id: file.path });
        }
    }

    // 3. Scan Google Drive
    if (userInfo) {
        const drive = mockGoogleApis.drive('v3');
        const gdriveFiles = await drive.files.list();
        for (const file of gdriveFiles.data.files) {
            if (file.size > sizeThreshold) {
                foundLarge.push({ ...file, id: file.id, isGoogleDrive: true });
            }
        }
    }

    setLargeFiles(foundLarge);
    setStatus(`Scan complete. Found ${foundLarge.length} large files.`);
  }, [userInfo]); // Re-run if userInfo changes

  /**
   * Handles the deletion of selected files.
   * @param {array} filesToDelete - An array of file objects to be deleted.
   * @param {string} scanType - The type of scan ('duplicates', 'junk', 'large') to re-run after deletion.
   */
  const deleteFiles = async (filesToDelete, scanType) => {
    if (filesToDelete.length === 0) return;

    Alert.alert(
        "Confirm Deletion",
        `Are you sure you want to delete ${filesToDelete.length} files? This action cannot be undone.`,
        [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    setStatus('Deleting files...');
                    try {
                        const drive = mockGoogleApis.drive('v3');
                        for (const file of filesToDelete) {
                            if (file.isGoogleDrive) {
                                await drive.files.delete({ fileId: file.id });
                            } else {
                                await mockRNFS.unlink(file.path);
                            }
                        }
                        Alert.alert("Success", `${filesToDelete.length} files have been deleted.`);
                        setStatus('Deletion complete. Re-scanning...');

                        // Refresh the list by re-running the appropriate scan
                        if (scanType === 'duplicates') await scanForDuplicates();
                        if (scanType === 'junk') await scanForJunk();
                        if (scanType === 'large') await scanForLargeFiles();

                    } catch (error) {
                        Alert.alert("Error", "Could not delete files.");
                        setStatus('Deletion failed.');
                    }
                }
            }
        ]
    );
  };

  /**
   * Simple state-based router to render the current screen.
   */
  const renderScreen = () => {
    switch (screen) {
      case 'Dashboard':
        return <DashboardScreen
                    setScreen={setScreen}
                    status={status}
                    userInfo={userInfo}
                    handleSignIn={handleSignIn}
                    handleSignOut={handleSignOut}
                />;
      case 'DuplicateFiles':
        return <DuplicateFilesScreen setScreen={setScreen} scan={scanForDuplicates} results={duplicateFiles} deleteFiles={deleteFiles} />;
      case 'JunkCache':
        return <JunkCacheScreen setScreen={setScreen} scan={scanForJunk} results={junkFiles} deleteFiles={deleteFiles} />;
      case 'LargeFiles':
        return <LargeFilesScreen setScreen={setScreen} scan={scanForLargeFiles} results={largeFiles} deleteFiles={deleteFiles} />;
      default:
        return <DashboardScreen setScreen={setScreen} />;
    }
  };

  // Main render method for the app
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>Storage Manager</Text>
      {renderScreen()}
    </SafeAreaView>
  );
};

//==============================================================================
// STYLESHEET
// All styles for the application are defined here.
//==============================================================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  container: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#1c1e21',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  userInfo: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
  },
  authButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  authButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  statBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    width: '48%',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  statLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007BFF',
    marginTop: 5,
  },
  statusText: {
    textAlign: 'center',
    marginVertical: 15,
    fontSize: 16,
    color: 'gray',
    fontStyle: 'italic',
  },
  scanButtonsContainer: {
    marginTop: 10,
  },
  scanButton: {
    backgroundColor: '#007BFF',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scanButtonSubtitle: {
    color: '#fff',
    fontSize: 14,
    marginTop: 5,
  },
  resultsContainer: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    marginVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#eee',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#007BFF',
    marginRight: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    width: 12,
    height: 12,
    backgroundColor: '#007BFF',
    borderRadius: 2,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
  },
  fileDetails: {
    fontSize: 12,
    color: 'gray',
  },
  duplicateGroup: {
    marginBottom: 15,
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1eaff'
  },
  groupHeader: {
    fontWeight: 'bold',
    marginBottom: 10,
    fontSize: 15,
  },
  deleteContainer: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  deleteSummary: {
      fontWeight: 'bold',
  }
});

export default App;
