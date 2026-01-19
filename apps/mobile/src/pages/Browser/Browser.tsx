import React, { useState } from 'react';
import { MobileHeader, MobileNavigation, MobileContent } from '../../components/layout';
import { Input } from '../../components/adapted';
import { Card, CardContent } from '@kn/ui';
import { Search, FileText, Folder, ChevronRight } from '@kn/icon';

interface FileItem {
  id: number;
  name: string;
  type: 'file' | 'folder';
  date: string;
  size?: string;
}

export const Browser: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const items: FileItem[] = [
    { id: 1, name: 'Documents', type: 'folder', date: 'Today' },
    { id: 2, name: 'Projects', type: 'folder', date: 'Yesterday' },
    { id: 3, name: 'Welcome.md', type: 'file', date: '2 hours ago', size: '2.4 KB' },
    { id: 4, name: 'Notes', type: 'folder', date: '3 days ago' },
    { id: 5, name: 'README.md', type: 'file', date: '1 week ago', size: '5.1 KB' },
    { id: 6, name: 'Archive', type: 'folder', date: '2 weeks ago' },
  ];

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <MobileHeader title="Browse" showBack />

      <MobileContent>
        <div className="p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* File List */}
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No items found</p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <Card key={item.id} className="touch-active cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {item.type === 'folder' ? (
                          <Folder className="w-6 h-6 text-blue-500" />
                        ) : (
                          <FileText className="w-6 h-6 text-gray-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{item.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{item.date}</span>
                          {item.size && (
                            <>
                              <span>•</span>
                              <span>{item.size}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </MobileContent>

      <MobileNavigation />
    </>
  );
};
