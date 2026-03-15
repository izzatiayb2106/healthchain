import React, { useState } from 'react';
import ipfs from '../ipfs';

const UploadFile = () => {
  const [fileUrl, setFileUrl] = useState('');

  const uploadFile = async (e) => {
    const file = e.target.files[0];
    try {
      const added = await ipfs.add(file);
      const url = `http://localhost:8081/ipfs/${added.path}`;
      setFileUrl(url);
      console.log('File uploaded:', url);
    } catch (err) {
      console.error('IPFS upload error:', err);
    }
  };

  return (
    <div>
      <input type="file" onChange={uploadFile} />
      {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer">{fileUrl}</a>}
    </div>
  );
};

export default UploadFile;