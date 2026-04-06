//
//  NavigationItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import Foundation

/// Wrapper type for all possible navigation destinations.
enum NavigationItem: Hashable {
    case history(SidebarItem)
    case footer(SidebarFooterItem)
}
