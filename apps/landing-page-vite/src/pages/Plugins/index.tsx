import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, IconButton, Rate, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { useEffect } from "react";
import Creator from "../../assets/creator.png"
import { ArrowRight, DownloadIcon, Heart, HeartIcon } from "@kn/icon";
import request from "../../utils/request"
import { usePath } from "../../utils/use-path";


export const Plugins: React.FC = () => {

    const filterItems = [
        "All Plugins",
        "Feature",
        "App",
        "Connector"
    ]

    const [selectedKey, setSelectedKey] = React.useState<string>("All Plugins")
    const [plugins, setPlugins] = React.useState<any>([]);

    useEffect(() => {
        request({
            url: '/knowledge-wiki/plugin/public/plugins',
            method: 'GET'
        }).then(res => {
            setPlugins(res.data.records)
        })
    }, [])

    function formatNumber(num) {
        console.log('num', num);

        if (num) {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        }
        return "0"
    }

    function renderStars(rating) {
        return <Rate disabled variant="yellow" rating={rating} />;
    }

    return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="flex items-start">
            <div>
                <div className="text-3xl md:text-4xl font-bold mb-4">Discover Kotion Plugins</div>
                <div className="text-gray-600 text-lg max-w-3xl mb-8 text-balance">Find and use the best plugins created by the community to boost your productivity and organize your life.</div>
                <div className="flex flex-wrap gap-2 mb-8">
                    {
                        filterItems.map((item, index) => (
                            <Button
                                variant={selectedKey === item ? "default" : "secondary"}
                                className="px-4 py-2 rounded-md text-sm transition-colors"
                                key={index}
                                onClick={() => setSelectedKey(item)}>
                                {item}
                            </Button>
                        ))
                    }
                </div>
            </div>
            <div className="">
                {/* <img src={Structure } width="150px" height="100%" /> */}
            </div>
        </div>
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold">Popular Plugins</h3>
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500 text-nowrap">Sort by :</div>
                <Select defaultValue="recent">
                    <SelectTrigger className="w-[100px] h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="recent">Recent</SelectItem>
                        <SelectItem value="popular">Popular</SelectItem>
                        <SelectItem value="trending">Trending</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
            {
                plugins.map((plugin, index) => (
                    <div className="p-6 shadow-md border bg-muted transition-colors rounded-md hover:bg-muted/50" key={index}>
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center">
                                <img src={usePath(plugin.icon)} alt={plugin.name} className="w-10 h-10 mr-3 rounded-md" />
                                <div>
                                    <h3 className="font-semibold text-nowrap text-ellipsis overflow-hidden">{plugin.name}</h3>
                                    <p className="text-xs">By {plugin.developer}</p>
                                </div>
                            </div>
                            <IconButton icon={<Heart className="h-4 w-4" />} className="transition-all-200" />
                        </div>

                        <p className=" text-gray-500 text-sm mb-4 line-clamp-2">{plugin.description}</p>

                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center">
                                <div className="flex items-center mr-1">
                                    {renderStars(plugin.rating)}
                                </div>
                                <span className="text-xs text-neutral-500">{plugin.rating.toFixed(1)} ({plugin.reviews})</span>
                            </div>
                            <span className="text-xs text-neutral-500">{formatNumber(plugin.downloads)} downloads</span>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="px-2 py-1 rounded-full text-xs bg-muted">{plugin.category.value}</span>
                        </div>

                        <div className="flex space-x-2">
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button className="h-9">
                                        View Details
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-[1000px] max-w-none">
                                    <DialogHeader>
                                        <DialogTitle>{plugin.name}</DialogTitle>
                                        <DialogDescription />
                                    </DialogHeader>
                                    <div className="modal-content transform w-full max-w-4xl overflow-hidden">
                                        <div className="p-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <img id="modal-screenshot" src={usePath(plugin.screenShot)} alt="Plugin Preview" className="w-full h-auto rounded-lg shadow-md" />
                                                </div>

                                                <div>
                                                    <div className="flex items-center mb-4">
                                                        <img id="modal-icon" src={usePath(plugin.icon)} alt="Plugin Icon" className="w-12 h-12 mr-4 rounded-md" />
                                                        <div>
                                                            <div className="flex items-center">
                                                                <div id="modal-rating" className="flex items-center text-yellow-400 mr-2">
                                                                    {renderStars(plugin.rating)}
                                                                </div>
                                                                <span id="modal-rating-text" className="text-neutral-600">{plugin.rating}</span>
                                                            </div>
                                                            <div className="text-sm text-neutral-500">
                                                                <span id="modal-downloads">{plugin.downloads}</span> downloads
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mb-6">
                                                        <h4 className="font-semibold mb-2">Description</h4>
                                                        <p id="modal-description" className="text-gray-400">
                                                            {plugin.description}
                                                        </p>
                                                    </div>

                                                    <div className="mb-6">
                                                        <h4 className="font-semibold mb-2">Features</h4>
                                                        <ul id="modal-features" className="list-disc list-inside text-gray-400 space-y-1">
                                                            {plugin.features && plugin.features.map((feature, index) => (
                                                                <li key={index}>{feature}</li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 mb-6 ">
                                                        <Badge id="modal-category" className="text-sm" >
                                                            {plugin.category.value}
                                                        </Badge>
                                                        <Badge id="modal-author" className="text-sm">
                                                            By&nbsp;<span className="font-medium">{plugin.developer}</span>
                                                        </Badge>
                                                    </div>

                                                    <div className="flex space-x-1">
                                                        <Button className="h-9">
                                                            Add to Kotion
                                                        </Button>
                                                        <Button className="h-9">
                                                            <HeartIcon className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                            <Button className="h-9">
                                <DownloadIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))
            }
        </div>
        <section className=" bg-muted/50 rounded-xl p-8 text-center mb-16 mt-10">
            <h3 className="text-2xl font-bold mb-4">Can't find what you're looking for?</h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">Request a specific template or create and share your own to help the community.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button>
                    Request a Plugin
                </Button>
                <Button variant="outline">
                    Share Your Plugin
                </Button>
            </div>
        </section>
        <section className=" rounded-xl p-8 flex items-center justify-center mb-16 gap-2">
            <img src={Creator} width={244} />
            <div>
                <h3 className="text-2xl font-bold mb-4">Become a creator</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">Submit your plugin to the Kotion plugin gallery, get featured, and even get paid – all in just a few clicks.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Button variant="outline" className="flex items-center gap-1">
                        Get started <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </section>
    </div>
}