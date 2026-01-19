import React from 'react';
import { MobileHeader, MobileNavigation, MobileContent } from '../../components/layout';
import { Card, CardContent, Switch, Separator } from '@kn/ui';
import { User, Bell, Palette, Shield, HelpCircle, LogOut, ChevronRight } from '@kn/icon';

export const Settings: React.FC = () => {
  const settingsSections = [
    {
      title: 'Account',
      items: [
        { icon: <User className="w-5 h-5" />, label: 'Profile', hasArrow: true },
        { icon: <Shield className="w-5 h-5" />, label: 'Privacy & Security', hasArrow: true },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: <Bell className="w-5 h-5" />, label: 'Notifications', toggle: true, value: true },
        { icon: <Palette className="w-5 h-5" />, label: 'Dark Mode', toggle: true, value: false },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: <HelpCircle className="w-5 h-5" />, label: 'Help & Feedback', hasArrow: true },
      ],
    },
  ];

  return (
    <>
      <MobileHeader title="Settings" showBack />

      <MobileContent>
        <div className="p-4 space-y-6">
          {/* User Profile Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">John Doe</h3>
                  <p className="text-sm text-muted-foreground">john.doe@example.com</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Sections */}
          {settingsSections.map((section, sectionIndex) => (
            <section key={sectionIndex}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
                {section.title}
              </h3>
              <Card>
                <CardContent className="p-0">
                  {section.items.map((item, itemIndex) => (
                    <React.Fragment key={itemIndex}>
                      {itemIndex > 0 && <Separator />}
                      <button className="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors text-left touch-active">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{item.icon}</span>
                          <span className="font-medium">{item.label}</span>
                        </div>
                        {item.toggle !== undefined ? (
                          <Switch checked={item.value} />
                        ) : item.hasArrow ? (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        ) : null}
                      </button>
                    </React.Fragment>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}

          {/* Logout Button */}
          <Card>
            <CardContent className="p-0">
              <button className="w-full flex items-center justify-between p-4 hover:bg-destructive/10 transition-colors text-left touch-active text-destructive">
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Log Out</span>
                </div>
              </button>
            </CardContent>
          </Card>

          {/* Version Info */}
          <p className="text-center text-sm text-muted-foreground">
            Version 0.0.16
          </p>
        </div>
      </MobileContent>

      <MobileNavigation />
    </>
  );
};
