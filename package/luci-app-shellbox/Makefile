include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-shellbox
PKG_VERSION:=1.1
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Kazusa1085

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-shellbox
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=TerminalPlus
  DEPENDS:=+luci-base +rpcd +cgi-io +ttyd +unzip +libubox +libubus
  PKGARCH:=all
endef

define Package/luci-app-shellbox/description
  TerminalPlus combines an xterm.js terminal backed by ttyd with a browser
  file manager, exposing both as one LuCI application.
endef

define Package/luci-app-shellbox/conffiles
/etc/config/shellbox
endef

define Build/Compile
endef

define Package/luci-app-shellbox/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/profile.d
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_DIR) $(1)/etc/rc.d
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DIR) $(1)/usr/share/ucitrack
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DIR) $(1)/www/luci-static/resources/shellbox
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/shellbox
	$(CP) ./root/etc/config/shellbox $(1)/etc/config/
	$(CP) ./root/etc/init.d/shellbox $(1)/etc/init.d/
	$(CP) ./root/etc/profile.d/shellbox.sh $(1)/etc/profile.d/
	$(CP) ./root/etc/hotplug.d/iface/99-shellbox $(1)/etc/hotplug.d/iface/
	$(CP) ./root/usr/sbin/shellbox-ctl $(1)/usr/sbin/
	$(CP) ./root/usr/share/luci/menu.d/luci-app-shellbox.json $(1)/usr/share/luci/menu.d/
	$(CP) ./root/usr/share/rpcd/acl.d/luci-app-shellbox.json $(1)/usr/share/rpcd/acl.d/
	$(CP) ./root/usr/share/ucitrack/luci-app-shellbox.json $(1)/usr/share/ucitrack/
	$(CP) ./root/usr/lib/lua/luci/i18n/shellbox.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n/
	$(CP) ./htdocs/luci-static/resources/shellbox/. $(1)/www/luci-static/resources/shellbox/
	$(CP) ./htdocs/luci-static/resources/view/shellbox/terminal.js $(1)/www/luci-static/resources/view/shellbox/
	$(CP) ./htdocs/luci-static/resources/view/shellbox/settings.js $(1)/www/luci-static/resources/view/shellbox/
	chmod 0755 $(1)/etc/init.d/shellbox $(1)/usr/sbin/shellbox-ctl
	ln -sf ../init.d/shellbox $(1)/etc/rc.d/S98shellbox
	ln -sf ../init.d/shellbox $(1)/etc/rc.d/K10shellbox
endef

$(eval $(call BuildPackage,luci-app-shellbox))
