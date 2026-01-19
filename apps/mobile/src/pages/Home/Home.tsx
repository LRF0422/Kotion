import React, { useState } from 'react';
import { MobileHeader, MobileNavigation, MobileContent, MobileSidebar } from '../../components/layout';
import { Button } from '../../components/adapted';
import { Card, CardContent, CardHeader, CardTitle } from '@kn/ui';
import { FileText, Plus, Clock, Star, Menu } from 'lucide-react';

export const Home: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const quickActions = [
    { icon: <Plus className="w-6 h-6" />, label: 'New Document', color: 'bg-blue-500' },
    { icon: <FileText className="w-6 h-6" />, label: 'Browse Files', color: 'bg-green-500' },
    { icon: <Star className="w-6 h-6" />, label: 'Favorites', color: 'bg-yellow-500' },
  ];

  const recentItems = [
    { id: 1, title: 'Welcome Document', date: '2 hours ago', type: 'Document' },
    { id: 2, title: 'Project Notes', date: 'Yesterday', type: 'Note' },
    { id: 3, title: 'Meeting Minutes', date: '3 days ago', type: 'Document' },
  ];

  return (
    <>
      <MobileHeader
        title="KN Mobile"
        showMenu
        onMenuClick={() => setSidebarOpen(true)}
      />
      
      <MobileContent>
        <div className="p-4 space-y-6">
          {/* Welcome Section */}
          <section>
            <h2 className="text-2xl font-bold mb-2">Welcome Back!</h2>
            <p className="text-muted-foreground">
              Your knowledge repository on the go
            </p>
          </section>

          {/* Quick Actions */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
            <div className="grid grid-cols-3 gap-3">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card hover:bg-accent transition-colors touch-active"
                >
                  <div className={`${action.color} p-3 rounded-full text-white`}>
                    {action.icon}
                  </div>
                  <span className="text-xs text-center">{action.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recent Items */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Recent</h3>
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {recentItems.map((item) => (
                <Card key={item.id} className="touch-active cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium mb-1">{item.title}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{item.date}</span>
                          <span>•</span>
                          <span>{item.type}</span>
                        </div>
                      </div>
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">24</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  This Week
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">5</div>
              </CardContent>
            </Card>
          </section>
        </div>
      </MobileContent>

      <MobileNavigation />

      <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <div className="p-4 space-y-2">
          <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-accent transition-colors">
            Profile
          </button>
          <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-accent transition-colors">
            Help & Support
          </button>
          <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-accent transition-colors">
            About
          </button>
        </div>
      </MobileSidebar>
    </>
  );
};
